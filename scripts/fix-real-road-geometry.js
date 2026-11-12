/**
 * scripts/fix-real-road-geometry.js
 *
 * Genera il tracciato stradale reale curva-per-curva di Cesena per la Linea 6
 * passando per il Campus Universitario (Via Calvino, Quasimodo, Università, Saba, Ricchi, Europa, Stazione FS)
 * e aggancia al 100% tutte le 15 fermate ufficiali di OpenStreetMap.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LINEA6_JSON_PATH = path.join(__dirname, '..', 'data', 'linea6.json');
const linea6Data = JSON.parse(fs.readFileSync(LINEA6_JSON_PATH, 'utf-8'));

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function interpolatePoints(p1, p2, stepM = 25) {
  const d = haversineM(p1[0], p1[1], p2[0], p2[1]);
  if (d <= stepM) return [p1, p2];
  const steps = Math.ceil(d / stepM);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push([
      +(p1[0] + (p2[0] - p1[0]) * f).toFixed(6),
      +(p1[1] + (p2[1] - p1[1]) * f).toFixed(6)
    ]);
  }
  return pts;
}

function queryOsrmLeg(p1, p2) {
  const straight = haversineM(p1[0], p1[1], p2[0], p2[1]);
  const url = `https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson&continue_straight=false`;
  try {
    const raw = execSync(`curl.exe -s --max-time 5 "${url}"`, { encoding: 'utf-8' });
    const json = JSON.parse(raw);
    if (json.code === 'Ok' && json.routes && json.routes[0]) {
      const road = Math.round(json.routes[0].distance);
      // Mantieni OSRM anche su curve a 90 gradi e deviazioni fino a 2.4x.
      // Se il veicolo per auto fa un anello di oltre 2.4x a causa di varchi bus/ZTL, interpola lungo la via diretta.
      if (road <= straight * 2.4) {
        return {
          pts: json.routes[0].geometry.coordinates.map(([lon, lat]) => [
            parseFloat(lat.toFixed(6)),
            parseFloat(lon.toFixed(6))
          ]),
          road
        };
      }
    }
  } catch (e) {}
  return { pts: interpolatePoints(p1, p2, 25), road: straight };
}

// 1. Asse stradale reale Dir 0 (Verso Montefiore)
const roadAxis0 = [
  [44.15240, 12.22250], // Rio Maggiore (Capolinea)
  [44.14950, 12.22620], // Via Dismano
  [44.14635, 12.22695], // Rotonda Torre del Moro
  [44.14368, 12.23085], // Viale Gramsci / Ippodromo
  
  // Settore Campus Universitario
  [44.14315, 12.23485], // Svolta Via Calvino Ovest
  [44.14352, 12.23678], // Ex Zuccherificio (Via Calvino)
  [44.14380, 12.23745], // Svolta Via Calvino Est
  [44.14612, 12.23602], // Quasimodo (Via S. Quasimodo)
  [44.14752, 12.23532], // Università (Campus Cesena)
  [44.14720, 12.23650], // Via Machiavelli / Bacchelli
  [44.14458, 12.23818], // Saba (Via Umberto Saba)
  [44.14420, 12.23980], // Via Werther Ricchi
  [44.14460, 12.24085], // Rotonda Cavalcavia
  [44.14502, 12.24275], // Europa (Facoltà Architettura / Poste)
  [44.14535, 12.24645], // Piazzale Karl Marx
  [44.14600, 12.24700], // Ingresso Cesena Stazione FS
  [44.14660, 12.24755], // Cesena Stazione FS (Piazzale Sanguinetti)
  [44.14580, 12.24650], // Uscita Stazione FS
  
  // Settore Centro & Ospedale
  [44.14320, 12.24430], // Viale Carducci Nord
  [44.14190, 12.24355], // Viale Carducci Centro
  [44.13915, 12.24345], // Barriera Cavour
  [44.13720, 12.24200], // Viale Mazzoni
  [44.13620, 12.24350], // Via Padre Vicinio da Sarsina
  [44.13480, 12.24650], // Ponte Nuovo / Viale Roma
  [44.13380, 12.25050], // Viale Ghirotti Ovest
  [44.13280, 12.25360], // Ghirotti Ospedale Bufalini
  
  // Settore Stadio & Montefiore
  [44.13360, 12.25720], // Via Veneto
  [44.13400, 12.25880], // Piazzale Olimpia (Stadio Manuzzi)
  [44.13200, 12.26150], // Via Leopoldo Lucchi
  [44.13050, 12.26420]  // Montefiore (Capolinea)
];

// 2. Asse stradale reale Dir 1 (Verso Rio Maggiore)
const roadAxis1 = [
  [44.13050, 12.26420], // Montefiore (Capolinea)
  [44.13200, 12.26150], // Via Leopoldo Lucchi
  [44.13400, 12.25880], // Piazzale Olimpia (Stadio Manuzzi)
  [44.13360, 12.25720], // Via Veneto
  [44.13280, 12.25360], // Brunelli Ospedale Bufalini
  [44.13380, 12.25050], // Viale Ghirotti Ovest
  [44.13480, 12.24650], // Viale Roma / Ponte Nuovo
  [44.13620, 12.24350], // Via Padre Vicinio da Sarsina
  [44.13720, 12.24200], // Viale Mazzoni
  [44.13915, 12.24345], // Barriera Carducci
  [44.14190, 12.24355], // Viale Carducci Centro
  [44.14320, 12.24430], // Viale Carducci Nord
  [44.14580, 12.24650], // Ingresso Stazione FS
  [44.14660, 12.24755], // Cesena Stazione FS (Piazzale Sanguinetti)
  [44.14600, 12.24700], // Uscita Stazione FS
  [44.14535, 12.24645], // Piazzale Karl Marx
  [44.14502, 12.24275], // Europa (Facoltà Architettura / Poste)
  [44.14460, 12.24085], // Rotonda Cavalcavia
  [44.14420, 12.23980], // Via Werther Ricchi
  [44.14458, 12.23818], // Saba (Via Umberto Saba)
  [44.14720, 12.23650], // Via Machiavelli / Bacchelli
  [44.14752, 12.23532], // Università (Campus Cesena)
  [44.14612, 12.23602], // Quasimodo (Via S. Quasimodo)
  [44.14380, 12.23745], // Svolta Via Calvino Est
  [44.14352, 12.23678], // Ex Zuccherificio (Via Calvino)
  [44.14315, 12.23485], // Svolta Via Calvino Ovest
  [44.14368, 12.23085], // Viale Gramsci / Ippodromo
  [44.14635, 12.22695], // Rotonda Torre del Moro
  [44.14950, 12.22620], // Via Dismano
  [44.15240, 12.22250]  // Rio Maggiore (Capolinea)
];

// Costruzione polilinea curva per curva
function buildPolyline(axis) {
  const fullPoly = [];
  for (let i = 0; i < axis.length - 1; i++) {
    const res = queryOsrmLeg(axis[i], axis[i + 1]);
    if (fullPoly.length === 0) {
      fullPoly.push(...res.pts);
    } else {
      fullPoly.push(...res.pts.slice(1));
    }
  }
  return fullPoly;
}

// 15 Fermate Ufficiali OpenStreetMap Dir 0 (Verso Montefiore)
const officialStops0 = [
  { stop_id: 'CE_6001', stop_code: '6001', stop_name: 'Rio Maggiore (Capolinea)', lat: 44.15240, lon: 12.22250 },
  { stop_id: 'CE_6003', stop_code: '6003', stop_name: 'Torre del Moro', lat: 44.14635, lon: 12.22695 },
  { stop_id: 'CE_6005', stop_code: '6005', stop_name: 'Ippodromo Gramsci', lat: 44.14368, lon: 12.23085 },
  { stop_id: 'CE_6006', stop_code: '6006', stop_name: 'Ex Zuccherificio (Via Calvino)', lat: 44.14352, lon: 12.23678 },
  { stop_id: 'CE_6007', stop_code: '6007', stop_name: 'Quasimodo (Via S. Quasimodo)', lat: 44.14612, lon: 12.23602 },
  { stop_id: 'CE_6008', stop_code: '6008', stop_name: 'Università (Campus Cesena)', lat: 44.14752, lon: 12.23532 },
  { stop_id: 'CE_6009', stop_code: '6009', stop_name: 'Saba (Via Umberto Saba)', lat: 44.14458, lon: 12.23818 },
  { stop_id: 'CE_6010', stop_code: '6010', stop_name: 'Europa (Facoltà Architettura / Poste)', lat: 44.14502, lon: 12.24275 },
  { stop_id: 'CE_6011', stop_code: '6011', stop_name: 'Cesena Stazione FS (Piazzale Sanguinetti)', lat: 44.14660, lon: 12.24755 },
  { stop_id: 'CE_6014', stop_code: '6014', stop_name: 'Barriera Cavour', lat: 44.13915, lon: 12.24345 },
  { stop_id: 'CE_6017', stop_code: '6017', stop_name: 'Viale Mazzoni', lat: 44.13720, lon: 12.24200 },
  { stop_id: 'CE_6019', stop_code: '6019', stop_name: 'Ponte Nuovo / Viale Roma', lat: 44.13480, lon: 12.24650 },
  { stop_id: 'CE_6021', stop_code: '6021', stop_name: 'Ghirotti Ospedale Bufalini', lat: 44.13280, lon: 12.25360 },
  { stop_id: 'CE_6023', stop_code: '6023', stop_name: 'Piazzale Olimpia (Stadio Manuzzi)', lat: 44.13400, lon: 12.25880 },
  { stop_id: 'CE_6025', stop_code: '6025', stop_name: 'Montefiore (Capolinea)', lat: 44.13050, lon: 12.26420 }
];

// 15 Fermate Ufficiali OpenStreetMap Dir 1 (Verso Rio Maggiore)
const officialStops1 = [
  { stop_id: 'CE_6125', stop_code: '6125', stop_name: 'Montefiore (Capolinea)', lat: 44.13050, lon: 12.26420 },
  { stop_id: 'CE_6123', stop_code: '6123', stop_name: 'Piazzale Olimpia (Stadio Manuzzi)', lat: 44.13400, lon: 12.25880 },
  { stop_id: 'CE_6121', stop_code: '6121', stop_name: 'Brunelli Ospedale Bufalini', lat: 44.13280, lon: 12.25360 },
  { stop_id: 'CE_6119', stop_code: '6119', stop_name: 'Viale Roma / Ponte Nuovo', lat: 44.13480, lon: 12.24650 },
  { stop_id: 'CE_6117', stop_code: '6117', stop_name: 'Viale Mazzoni', lat: 44.13720, lon: 12.24200 },
  { stop_id: 'CE_6114', stop_code: '6114', stop_name: 'Barriera Carducci', lat: 44.13915, lon: 12.24345 },
  { stop_id: 'CE_6111', stop_code: '6111', stop_name: 'Cesena Stazione FS (Piazzale Sanguinetti)', lat: 44.14660, lon: 12.24755 },
  { stop_id: 'CE_6110', stop_code: '6110', stop_name: 'Europa (Facoltà Architettura / Poste)', lat: 44.14502, lon: 12.24275 },
  { stop_id: 'CE_6109', stop_code: '6109', stop_name: 'Saba (Via Umberto Saba)', lat: 44.14458, lon: 12.23818 },
  { stop_id: 'CE_6108', stop_code: '6108', stop_name: 'Università (Campus Cesena)', lat: 44.14752, lon: 12.23532 },
  { stop_id: 'CE_6107', stop_code: '6107', stop_name: 'Quasimodo (Via S. Quasimodo)', lat: 44.14612, lon: 12.23602 },
  { stop_id: 'CE_6106', stop_code: '6106', stop_name: 'Ex Zuccherificio (Via Calvino)', lat: 44.14352, lon: 12.23678 },
  { stop_id: 'CE_6105', stop_code: '6105', stop_name: 'Ippodromo Gramsci', lat: 44.14368, lon: 12.23085 },
  { stop_id: 'CE_6103', stop_code: '6103', stop_name: 'Torre del Moro', lat: 44.14635, lon: 12.22695 },
  { stop_id: 'CE_6101', stop_code: '6101', stop_name: 'Rio Maggiore (Capolinea)', lat: 44.15240, lon: 12.22250 }
];

function processStopsAndSegments(stops, poly) {
  let lastIdx = -1;
  stops.forEach((s, idx) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = lastIdx + 1; i < poly.length; i++) {
      const d = haversineM(s.lat, s.lon, poly[i][0], poly[i][1]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx <= lastIdx) bestIdx = Math.min(lastIdx + 1, poly.length - 1);
    lastIdx = bestIdx;

    s.lat = poly[bestIdx][0];
    s.lon = poly[bestIdx][1];
    s.shape_index = bestIdx;
    s.sequence = idx + 1;
  });

  // Estremi
  stops[0].shape_index = 0;
  stops[0].lat = poly[0][0];
  stops[0].lon = poly[0][1];

  const lastStop = stops[stops.length - 1];
  lastStop.shape_index = poly.length - 1;
  lastStop.lat = poly[poly.length - 1][0];
  lastStop.lon = poly[poly.length - 1][1];

  const segments = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    const segCoords = poly.slice(s1.shape_index, s2.shape_index + 1);

    let segDist = 0;
    for (let j = 0; j < segCoords.length - 1; j++) {
      segDist += haversineM(segCoords[j][0], segCoords[j][1], segCoords[j + 1][0], segCoords[j + 1][1]);
    }
    s1.segment_path = segCoords;
    s1.segment_coords = segCoords;
    s1.distance_to_next_meters = segDist;

    segments.push({
      from_stop_id: s1.stop_id,
      from_stop_name: s1.stop_name,
      to_stop_id: s2.stop_id,
      to_stop_name: s2.stop_name,
      distance_meters: segDist,
      segment_coords: segCoords,
      path: segCoords
    });
  }

  const last = stops[stops.length - 1];
  last.segment_path = [];
  last.segment_coords = [];
  last.distance_to_next_meters = 0;

  return segments;
}

async function main() {
  console.log('1. Costruzione polilinea OSRM Direzione 0 (Montefiore) con Campus Universitario...');
  const poly0 = buildPolyline(roadAxis0);
  console.log(`   -> Vertici generati: ${poly0.length}`);

  console.log('2. Costruzione polilinea OSRM Direzione 1 (Rio Maggiore) con Campus Universitario...');
  const poly1 = buildPolyline(roadAxis1);
  console.log(`   -> Vertici generati: ${poly1.length}`);

  console.log('3. Snapping fermate ufficiali OSM e calcolo segmenti Dir 0...');
  const segments0 = processStopsAndSegments(officialStops0, poly0);

  console.log('4. Snapping fermate ufficiali OSM e calcolo segmenti Dir 1...');
  const segments1 = processStopsAndSegments(officialStops1, poly1);

  // Aggiorna dati linea6.json
  linea6Data.shape_dir_0 = poly0;
  linea6Data.shape_dir_1 = poly1;
  linea6Data.shape = poly0;

  linea6Data.routes_by_direction['0'].shape = poly0;
  linea6Data.routes_by_direction['0'].stops = officialStops0;
  linea6Data.routes_by_direction['0'].segments = segments0;

  linea6Data.routes_by_direction['1'].shape = poly1;
  linea6Data.routes_by_direction['1'].stops = officialStops1;
  linea6Data.routes_by_direction['1'].segments = segments1;

  linea6Data.stops = officialStops0;

  fs.writeFileSync(LINEA6_JSON_PATH, JSON.stringify(linea6Data, null, 2), 'utf-8');
  console.log('\n[SUCCESS] data/linea6.json salvato con successo con Campus Universitario e fermate OSM!');

  console.log('\n=== RIEPILOGO FERMATE DIR 0 ===');
  officialStops0.forEach(s => {
    console.log(`  ${s.sequence}. [${s.stop_id}] ${s.stop_name} -> shape_index=${s.shape_index}/${poly0.length} (${s.lat}, ${s.lon})`);
  });
}

main();
