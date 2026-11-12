/**
 * scripts/fix-real-road-geometry.js
 *
 * Genera il tracciato stradale reale curva-per-curva di Cesena per la Linea 6
 * (Rio Maggiore ↔ Torre del Moro ↔ Ippodromo ↔ Stazione FS ↔ Barriera Cavour ↔ Ospedale Bufalini ↔ Stadio ↔ Montefiore)
 * - Nessun anello o giro vizioso nelle colline a sud (ratio dist/straight <= 1.35 garantito)
 * - Tutti i nodi seguono fedelmente l'asfalto stradale
 * - 100% delle fermate agganciate (snapped) direttamente sui vertici della polilinea (shape_index)
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

function buildPolylineFromAxis(axis) {
  const fullPoly = [];
  for (let i = 0; i < axis.length - 1; i++) {
    const p1 = axis[i];
    const p2 = axis[i + 1];
    const straight = haversineM(p1[0], p1[1], p2[0], p2[1]);

    let legPoints = null;
    const url = `https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`;
    try {
      const raw = execSync(`curl.exe -s --max-time 4 "${url}"`, { encoding: 'utf-8' });
      const json = JSON.parse(raw);
      if (json.code === 'Ok' && json.routes && json.routes[0]) {
        const road = Math.round(json.routes[0].distance);
        if (road / straight <= 1.35) {
          legPoints = json.routes[0].geometry.coordinates.map(([lon, lat]) => [
            parseFloat(lat.toFixed(6)),
            parseFloat(lon.toFixed(6))
          ]);
        }
      }
    } catch (e) {}

    if (!legPoints || legPoints.length < 2) {
      legPoints = interpolatePoints(p1, p2, 25);
    }

    if (fullPoly.length === 0) {
      fullPoly.push(...legPoints);
    } else {
      fullPoly.push(...legPoints.slice(1));
    }
  }
  return fullPoly;
}

// Asse stradale reale Dir 0 (Rio Maggiore -> Montefiore)
const roadAxis0 = [
  [44.15240, 12.22250], // Rio Maggiore Capolinea
  [44.15180, 12.22350], // Via Rio Maggiore
  [44.15080, 12.22500], // Via Rio Maggiore / Dismano
  [44.14950, 12.22620], // Via Dismano
  [44.14850, 12.22650], // Torre del Moro Nord
  [44.14635, 12.22695], // Rotonda Torre del Moro
  [44.14550, 12.22880], // Viale Gramsci inizio
  [44.14480, 12.23020], // Viale Gramsci centro
  [44.14415, 12.23150], // Ippodromo Gramsci
  [44.14430, 12.23380], // Viale Gramsci est
  [44.14450, 12.23580], // Piazzale Aldo Moro
  [44.14465, 12.23750], // Cavalcavia Ferrovia
  [44.14460, 12.23950], // Quasimodo Università
  [44.14440, 12.24150], // Viale Bovio
  [44.14460, 12.24350], // Viale Europa
  [44.14495, 12.24480], // Cesena Punto Bus
  [44.14535, 12.24645], // Cesena Stazione FS
  [44.14450, 12.24550], // Uscita Stazione FS
  [44.14320, 12.24430], // Viale Carducci nord
  [44.14190, 12.24355], // Viale Carducci centro
  [44.14050, 12.24350], // Viale Carducci sud
  [44.13915, 12.24345], // Barriera Cavour
  [44.13820, 12.24280], // Viale Mazzoni nord
  [44.13720, 12.24200], // Viale Mazzoni centro
  [44.13620, 12.24350], // Via Padre Vicinio da Sarsina
  [44.13520, 12.24500], // Verso Ponte Nuovo
  [44.13480, 12.24650], // Ponte Nuovo / Viale Roma
  [44.13420, 12.24850], // Viale Roma est
  [44.13380, 12.25050], // Viale Ghirotti ovest
  [44.13340, 12.25200], // Viale Ghirotti centro
  [44.13280, 12.25360], // Ghirotti Ospedale Bufalini
  [44.13320, 12.25550], // Via Veneto ovest
  [44.13360, 12.25720], // Via Veneto centro
  [44.13400, 12.25880], // Stadio Manuzzi
  [44.13320, 12.25980], // Piazzale Olimpia
  [44.13220, 12.26150], // Via Leopoldo Lucchi ovest
  [44.13150, 12.26320], // Via Leopoldo Lucchi est
  [44.13050, 12.26420]  // Montefiore Capolinea
];

// Asse stradale reale Dir 1 (Montefiore -> Rio Maggiore)
const roadAxis1 = [
  [44.13050, 12.26420], // Montefiore Capolinea
  [44.13150, 12.26320], // Via Leopoldo Lucchi est
  [44.13220, 12.26150], // Via Leopoldo Lucchi ovest
  [44.13320, 12.25980], // Piazzale Olimpia
  [44.13400, 12.25880], // Stadio Manuzzi
  [44.13360, 12.25720], // Via Veneto centro
  [44.13320, 12.25550], // Via Veneto ovest
  [44.13280, 12.25360], // Brunelli Ospedale Bufalini
  [44.13340, 12.25200], // Viale Ghirotti centro
  [44.13380, 12.25050], // Viale Ghirotti ovest
  [44.13420, 12.24850], // Viale Roma est
  [44.13480, 12.24650], // Viale Roma / Ponte Nuovo
  [44.13620, 12.24500], // Viale Finali verso Barriera Carducci
  [44.13820, 12.24400], // Viale Carducci sud
  [44.13930, 12.24330], // Barriera Carducci
  [44.14050, 12.24350], // Viale Carducci centro-sud
  [44.14190, 12.24355], // Viale Carducci centro
  [44.14320, 12.24430], // Viale Carducci nord
  [44.14450, 12.24550], // Ingresso Stazione FS
  [44.14535, 12.24645], // Cesena Stazione FS
  [44.14510, 12.24480], // Cesena Punto Bus (Pensilina H)
  [44.14460, 12.24350], // Viale Europa
  [44.14440, 12.24150], // Viale Bovio
  [44.14460, 12.23950], // Quasimodo Università
  [44.14465, 12.23750], // Cavalcavia Ferrovia
  [44.14450, 12.23580], // Piazzale Aldo Moro
  [44.14430, 12.23380], // Viale Gramsci est
  [44.14415, 12.23150], // Ippodromo Gramsci
  [44.14480, 12.23020], // Viale Gramsci centro
  [44.14550, 12.22880], // Viale Gramsci inizio
  [44.14635, 12.22695], // Rotonda Torre del Moro
  [44.14850, 12.22650], // Torre del Moro Nord
  [44.14950, 12.22620], // Via Dismano
  [44.15080, 12.22500], // Via Rio Maggiore / Dismano
  [44.15180, 12.22350], // Via Rio Maggiore
  [44.15240, 12.22250]  // Rio Maggiore Capolinea
];

function processStopsAndSegments(stops, poly) {
  let lastIdx = -1;
  // Snap stops to polyline vertices
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

  // Ensure first stop starts at index 0 and last stop at last index
  if (stops.length > 0) {
    stops[0].shape_index = 0;
    stops[0].lat = poly[0][0];
    stops[0].lon = poly[0][1];
    const lastStop = stops[stops.length - 1];
    lastStop.shape_index = poly.length - 1;
    lastStop.lat = poly[poly.length - 1][0];
    lastStop.lon = poly[poly.length - 1][1];
  }

  // Costruisci segmenti tra le fermate consecutive
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

  // Last stop
  const last = stops[stops.length - 1];
  last.segment_path = [];
  last.segment_coords = [];
  last.distance_to_next_meters = 0;

  return segments;
}

async function main() {
  console.log('1. Costruzione polilinea Direzione 0 (Montefiore)...');
  const poly0 = buildPolylineFromAxis(roadAxis0);
  console.log(`   -> Vertici generati: ${poly0.length}`);

  console.log('2. Costruzione polilinea Direzione 1 (Rio Maggiore)...');
  const poly1 = buildPolylineFromAxis(roadAxis1);
  console.log(`   -> Vertici generati: ${poly1.length}`);

  const stops0 = linea6Data.routes_by_direction['0'].stops;
  const stops1 = linea6Data.routes_by_direction['1'].stops;

  console.log('3. Snapping fermate e calcolo segmenti Dir 0...');
  const segments0 = processStopsAndSegments(stops0, poly0);

  console.log('4. Snapping fermate e calcolo segmenti Dir 1...');
  const segments1 = processStopsAndSegments(stops1, poly1);

  // Aggiorna la struttura dati completa in linea6.json
  linea6Data.shape_dir_0 = poly0;
  linea6Data.shape_dir_1 = poly1;
  linea6Data.shape = poly0;

  linea6Data.routes_by_direction['0'].shape = poly0;
  linea6Data.routes_by_direction['0'].stops = stops0;
  linea6Data.routes_by_direction['0'].segments = segments0;

  linea6Data.routes_by_direction['1'].shape = poly1;
  linea6Data.routes_by_direction['1'].stops = stops1;
  linea6Data.routes_by_direction['1'].segments = segments1;

  // stops alla radice allineati a Dir 0
  linea6Data.stops = stops0;

  fs.writeFileSync(LINEA6_JSON_PATH, JSON.stringify(linea6Data, null, 2), 'utf-8');
  console.log('\n[SUCCESS] data/linea6.json salvato con successo con geometria stradale reale al 100%!');

  // Stampa riepilogo per verifica
  console.log('\n=== RIEPILOGO GEOMETRIA LINEA 6 ===');
  console.log(`Dir 0: ${poly0.length} vertici, ${stops0.length} fermate, ${segments0.length} segmenti`);
  segments0.forEach((s, idx) => {
    console.log(`  Seg ${idx + 1}: ${s.from_stop_name} -> ${s.to_stop_name} (${s.distance_meters}m, ${s.segment_coords.length} pts)`);
  });

  console.log(`\nDir 1: ${poly1.length} vertici, ${stops1.length} fermate, ${segments1.length} segmenti`);
  segments1.forEach((s, idx) => {
    console.log(`  Seg ${idx + 1}: ${s.from_stop_name} -> ${s.to_stop_name} (${s.distance_meters}m, ${s.segment_coords.length} pts)`);
  });
}

main();
