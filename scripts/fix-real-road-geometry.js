const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LINEA6_JSON_PATH = path.join(__dirname, '..', 'data', 'linea6.json');

// Carica dati attuali
const linea6Data = JSON.parse(fs.readFileSync(LINEA6_JSON_PATH, 'utf-8'));

function queryOsrmRoute(waypoints) {
  // OSRM accetta coordinate lon,lat separate da punto e virgola
  const coordString = waypoints.map(pt => `${pt.lon},${pt.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&continue_straight=true&steps=true`;
  
  try {
    const raw = execSync(`curl.exe -s "${url}"`, { encoding: 'utf-8', timeout: 15000 });
    const json = JSON.parse(raw);
    if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
      // GeoJSON restituisce [lon, lat], convertiamo in [lat, lon] per Leaflet
      const leafletCoords = json.routes[0].geometry.coordinates.map(([lon, lat]) => [
        parseFloat(lat.toFixed(6)),
        parseFloat(lon.toFixed(6))
      ]);
      const distanceMeters = Math.round(json.routes[0].distance);
      return { coords: leafletCoords, distance: distanceMeters };
    }
  } catch (err) {
    console.warn(`[OSRM] Errore chiamata:`, err.message);
  }
  return null;
}

// Calcolo distanza Haversine di fallback
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function processDirection(dirId, stops, dirName) {
  console.log(`\n=== ELABORAZIONE DIREZIONE ${dirId} (${dirName}) ===`);
  const segments = [];
  const fullShape = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    console.log(`[Seg ${i+1}/${stops.length - 1}] ${s1.stop_name} -> ${s2.stop_name}`);

    // Prova query OSRM per il singolo segmento
    let res = queryOsrmRoute([s1, s2]);

    // Se per qualche motivo OSRM non risponde o dà pochi punti, riprova con continue_straight=false
    if (!res || res.coords.length < 2) {
      const urlSimple = `https://router.project-osrm.org/route/v1/driving/${s1.lon},${s1.lat};${s2.lon},${s2.lat}?overview=full&geometries=geojson`;
      try {
        const raw = execSync(`curl.exe -s "${urlSimple}"`, { encoding: 'utf-8', timeout: 15000 });
        const json = JSON.parse(raw);
        if (json.code === 'Ok' && json.routes?.[0]) {
          res = {
            coords: json.routes[0].geometry.coordinates.map(([lon, lat]) => [
              parseFloat(lat.toFixed(6)),
              parseFloat(lon.toFixed(6))
            ]),
            distance: Math.round(json.routes[0].distance)
          };
        }
      } catch (e) {}
    }

    if (!res || res.coords.length < 2) {
      console.warn(`  ! Fallback geometrico per segmento ${i}`);
      res = {
        coords: [[s1.lat, s1.lon], [s2.lat, s2.lon]],
        distance: haversineDistanceMeters(s1.lat, s1.lon, s2.lat, s2.lon)
      };
    }

    console.log(`  -> Punti stradali: ${res.coords.length}, distanza: ${res.distance}m`);

    segments.push({
      from_stop_id: s1.stop_id,
      from_stop_name: s1.stop_name,
      to_stop_id: s2.stop_id,
      to_stop_name: s2.stop_name,
      distance_meters: res.distance,
      segment_coords: res.coords,
      path: res.coords
    });

    // Aggiungi alla polilinea completa evitando duplicazioni del punto di giunzione
    if (fullShape.length === 0) {
      fullShape.push(...res.coords);
    } else {
      fullShape.push(...res.coords.slice(1));
    }
  }

  console.log(`Totale punti polilinea Direzione ${dirId}: ${fullShape.length}`);
  return { segments, shape: fullShape };
}

async function run() {
  const dir0Stops = linea6Data.routes_by_direction['0'].stops;
  const dir1Stops = linea6Data.routes_by_direction['1'].stops;

  const result0 = await processDirection('0', dir0Stops, 'Verso Montefiore');
  const result1 = await processDirection('1', dir1Stops, 'Verso Rio Maggiore');

  // Aggiorna data/linea6.json
  linea6Data.shape_dir_0 = result0.shape;
  linea6Data.shape_dir_1 = result1.shape;
  linea6Data.shape = result0.shape; // default

  linea6Data.routes_by_direction['0'].shape = result0.shape;
  linea6Data.routes_by_direction['0'].segments = result0.segments;

  linea6Data.routes_by_direction['1'].shape = result1.shape;
  linea6Data.routes_by_direction['1'].segments = result1.segments;

  // Assegna anche segment_coords a ciascuna fermata per rapido accesso
  dir0Stops.forEach((s, idx) => {
    if (idx < result0.segments.length) {
      s.segment_coords = result0.segments[idx].segment_coords;
      s.distance_to_next_meters = result0.segments[idx].distance_meters;
    }
  });

  dir1Stops.forEach((s, idx) => {
    if (idx < result1.segments.length) {
      s.segment_coords = result1.segments[idx].segment_coords;
      s.distance_to_next_meters = result1.segments[idx].distance_meters;
    }
  });

  fs.writeFileSync(LINEA6_JSON_PATH, JSON.stringify(linea6Data, null, 2), 'utf-8');
  console.log('\n[SUCCESS] data/linea6.json salvato con successo con la geometria stradale reale OSRM!');
}

run();
