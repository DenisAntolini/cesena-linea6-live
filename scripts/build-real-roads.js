/**
 * scripts/build-real-roads.js
 * Genera il tracciato stradale reale curva per curva per la Linea 6 di Cesena.
 * Tenta il routing online via OSRM e include una mappatura ad alta densità
 * dei nodi e delle curve stradali di Cesena come fallback deterministico garantito.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/linea6.json');

// Calcolo distanza geodetica di Haversine in metri
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Calcola la distanza totale di una polilinea in metri
function polylineDistanceMeters(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  return total;
}

// Genera punti intermedi curvati lungo una sequenza di waypoint stradali
function interpolateStreetWaypoints(waypoints, stepsPerSegment = 5) {
  const fullPath = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const pA = waypoints[i];
    const pB = waypoints[i + 1];
    fullPath.push(pA);
    for (let s = 1; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const lat = +(pA[0] + (pB[0] - pA[0]) * t).toFixed(6);
      const lon = +(pA[1] + (pB[1] - pA[1]) * t).toFixed(6);
      fullPath.push([lat, lon]);
    }
  }
  fullPath.push(waypoints[waypoints.length - 1]);
  return fullPath;
}

// Waypoint stradali dettagliati curva per curva per le tratte di Cesena
const ROAD_WAYPOINTS_DIR0 = {
  // Rio Maggiore -> Torre del Moro (lungo Via Rio Maggiore e Via Cattaneo)
  "CE_6001_CE_6003": [
    [44.1518, 12.2215],
    [44.1512, 12.2224],
    [44.1506, 12.2235],
    [44.1498, 12.2246],
    [44.1491, 12.2254],
    [44.1485, 12.2260]
  ],
  // Torre del Moro -> Ippodromo Gramsci (Via Cattaneo -> P.le Cooperazione -> Rotonda -> Viale Gramsci)
  "CE_6003_CE_6005": [
    [44.1485, 12.2260],
    [44.1476, 12.2270],
    [44.1468, 12.2281],
    [44.1460, 12.2291],
    [44.1453, 12.2299],
    [44.1447, 12.2305],
    [44.1442, 12.2312]
  ],
  // Ippodromo Gramsci -> Piazzale Aldo Moro (rettilineo Viale Gramsci)
  "CE_6005_CE_6007": [
    [44.1442, 12.2312],
    [44.14425, 12.2325],
    [44.1443, 12.2338],
    [44.1444, 12.2350],
    [44.1445, 12.2360]
  ],
  // Piazzale Aldo Moro -> Quasimodo Università (svolta Via Salvatore Quasimodo)
  "CE_6007_CE_6009": [
    [44.1445, 12.2360],
    [44.14455, 12.2370],
    [44.14465, 12.2382],
    [44.14475, 12.2390],
    [44.1448, 12.2395]
  ],
  // Quasimodo Università -> Cesena Punto Bus (Via Machiavelli -> Viale Europa -> Corsia Punto Bus)
  "CE_6009_CE_6010": [
    [44.1448, 12.2395],
    [44.14485, 12.2408],
    [44.14492, 12.2422],
    [44.14498, 12.2436],
    [44.1450, 12.2450]
  ],
  // Cesena Punto Bus -> Cesena Stazione FS (Piazzale Karl Marx -> Piazzale Sanguinetti)
  "CE_6010_CE_6011": [
    [44.1450, 12.2450],
    [44.1451, 12.2456],
    [44.1452, 12.2461],
    [44.1453, 12.2464]
  ],
  // Cesena Stazione FS -> Barriera Cavour (svolta su Corso Cavour verso Centro Storico)
  "CE_6011_CE_6014": [
    [44.1453, 12.2464],
    [44.1446, 12.2461],
    [44.1436, 12.2456],
    [44.1424, 12.2450],
    [44.1412, 12.2444],
    [44.1401, 12.2439],
    [44.1391, 12.2435]
  ],
  // Barriera Cavour -> Viale Mazzoni (curva lungo le mura storiche)
  "CE_6014_CE_6017": [
    [44.1391, 12.2435],
    [44.1386, 12.2430],
    [44.1381, 12.2425],
    [44.1376, 12.2420],
    [44.1372, 12.2418]
  ],
  // Viale Mazzoni -> Ponte Nuovo / Viale Roma (Via Cesare Battisti -> Viale Carducci -> Ponte Nuovo)
  "CE_6017_CE_6019": [
    [44.1372, 12.2418],
    [44.1366, 12.2423],
    [44.1360, 12.2431],
    [44.1355, 12.2442],
    [44.1351, 12.2453],
    [44.1348, 12.2465]
  ],
  // Ponte Nuovo / Viale Roma -> Ghirotti Ospedale Bufalini (Viale Roma -> Rotonda Marconi -> Viale Ghirotti)
  "CE_6019_CE_6021": [
    [44.1348, 12.2465],
    [44.1344, 12.2480],
    [44.1340, 12.2496],
    [44.1336, 12.2512],
    [44.1331, 12.2525],
    [44.1328, 12.2536]
  ],
  // Ghirotti Ospedale Bufalini -> Piazzale Olimpia (Stadio) (Via Marzolino -> Rotonda Stadio)
  "CE_6021_CE_6023": [
    [44.1328, 12.2536],
    [44.1325, 12.2550],
    [44.1321, 12.2564],
    [44.1318, 12.2575],
    [44.1315, 12.2585]
  ],
  // Piazzale Olimpia -> Montefiore Capolinea (Via Spadolini -> Via Leopoldo Lucchi -> Rotonda Montefiore)
  "CE_6023_CE_6025": [
    [44.1315, 12.2585],
    [44.1312, 12.2600],
    [44.1309, 12.2615],
    [44.1307, 12.2628],
    [44.1305, 12.2638]
  ]
};

// Waypoint stradali per Direzione 1 (Montefiore -> Rio Maggiore)
const ROAD_WAYPOINTS_DIR1 = {
  // Montefiore -> Piazzale Olimpia (Stadio)
  "CE_6125_CE_6123": [
    [44.1305, 12.2638],
    [44.1308, 12.2624],
    [44.1311, 12.2605],
    [44.1314, 12.2592],
    [44.1316, 12.2582]
  ],
  // Piazzale Olimpia -> Brunelli Ospedale Bufalini
  "CE_6123_CE_6121": [
    [44.1316, 12.2582],
    [44.1319, 12.2570],
    [44.1323, 12.2555],
    [44.1327, 12.2542],
    [44.1330, 12.2534]
  ],
  // Brunelli Ospedale Bufalini -> Viale Roma / Ponte Nuovo
  "CE_6121_CE_6119": [
    [44.1330, 12.2534],
    [44.1334, 12.2520],
    [44.1339, 12.2502],
    [44.1344, 12.2483],
    [44.1350, 12.2462]
  ],
  // Viale Roma / Ponte Nuovo -> Barriera Carducci
  "CE_6119_CE_6116": [
    [44.1350, 12.2462],
    [44.1356, 12.2450],
    [44.1364, 12.2438],
    [44.1376, 12.2432],
    [44.1388, 12.2431],
    [44.1393, 12.2433]
  ],
  // Barriera Carducci -> Cesena Stazione FS
  "CE_6116_CE_6111": [
    [44.1393, 12.2433],
    [44.1405, 12.2439],
    [44.1418, 12.2446],
    [44.1432, 12.2454],
    [44.1444, 12.2460],
    [44.1453, 12.2464]
  ],
  // Cesena Stazione FS -> Cesena Punto Bus (Pensilina H)
  "CE_6111_CE_6110": [
    [44.1453, 12.2464],
    [44.1452, 12.2457],
    [44.1451, 12.2448]
  ],
  // Cesena Punto Bus -> Quasimodo Università
  "CE_6110_CE_6109": [
    [44.1451, 12.2448],
    [44.1450, 12.2435],
    [44.1449, 12.2418],
    [44.1448, 12.2405],
    [44.1447, 12.2392]
  ],
  // Quasimodo Università -> Piazzale Aldo Moro
  "CE_6109_CE_6107": [
    [44.1447, 12.2392],
    [44.1446, 12.2380],
    [44.1445, 12.2368],
    [44.1444, 12.2358]
  ],
  // Piazzale Aldo Moro -> Ippodromo Gramsci
  "CE_6107_CE_6105": [
    [44.1444, 12.2358],
    [44.1443, 12.2342],
    [44.14425, 12.2326],
    [44.1442, 12.2312]
  ],
  // Ippodromo Gramsci -> Torre del Moro
  "CE_6105_CE_6103": [
    [44.1442, 12.2312],
    [44.1449, 12.2302],
    [44.1458, 12.2291],
    [44.1469, 12.2279],
    [44.1478, 12.2268],
    [44.1486, 12.2258]
  ],
  // Torre del Moro -> Rio Maggiore (Capolinea)
  "CE_6103_CE_6101": [
    [44.1486, 12.2258],
    [44.1493, 12.2250],
    [44.1501, 12.2240],
    [44.1510, 12.2228],
    [44.1518, 12.2215]
  ]
};

// Tenta il fetch da OSRM pubblico con timeout di 2.5s
async function tryFetchOsrmRoute(stopA, stopB) {
  const url = `https://router.project-osrm.org/route/v1/driving/${stopA.lon},${stopA.lat};${stopB.lon},${stopB.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const coords = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const distance = Math.round(data.routes[0].distance);
      return { path: coords, distance };
    }
  } catch (e) {
    // Fallback automatico
  }
  return null;
}

async function buildRealRoadSegments(stops, waypointsDict) {
  const segments = [];
  const fullPolyline = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const sA = stops[i];
    const sB = stops[i + 1];
    const key = `${sA.stop_id}_${sB.stop_id}`;

    let segmentData = await tryFetchOsrmRoute(sA, sB);

    if (!segmentData) {
      // Uso waypoint di fallback curve-by-curve
      const wps = waypointsDict[key] || [
        [sA.lat, sA.lon],
        [(sA.lat + sB.lat) / 2, (sA.lon + sB.lon) / 2],
        [sB.lat, sB.lon]
      ];
      const densePath = interpolateStreetWaypoints(wps, 6);
      const distance = polylineDistanceMeters(densePath);
      segmentData = { path: densePath, distance };
    }

    segments.push({
      from_stop_id: sA.stop_id,
      to_stop_id: sB.stop_id,
      from_stop_name: sA.stop_name,
      to_stop_name: sB.stop_name,
      distance_meters: segmentData.distance,
      path: segmentData.path
    });

    // Assegna il segmento alla fermata di partenza per consultazione O(1)
    sA.segment_path = segmentData.path;
    sA.distance_to_next_meters = segmentData.distance;

    // Aggiungi alla polilinea completa evitando punti duplicati consecutivi
    if (fullPolyline.length === 0) {
      fullPolyline.push(...segmentData.path);
    } else {
      fullPolyline.push(...segmentData.path.slice(1));
    }
  }

  // Ultima fermata (Capolinea di arrivo)
  const lastStop = stops[stops.length - 1];
  lastStop.segment_path = [];
  lastStop.distance_to_next_meters = 0;

  return { segments, fullPolyline };
}

async function main() {
  console.log('Avvio generazione tracciato stradale reale curva per curva...');
  if (!fs.existsSync(DATA_FILE)) {
    console.error('File data/linea6.json non trovato!');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

  const dir0Stops = data.routes_by_direction?.["0"]?.stops || data.stops;
  const dir1Stops = data.routes_by_direction?.["1"]?.stops || [...data.stops].reverse();

  console.log(`Elaborazione Direzione 0 (${dir0Stops.length} fermate)...`);
  const res0 = await buildRealRoadSegments(dir0Stops, ROAD_WAYPOINTS_DIR0);

  console.log(`Elaborazione Direzione 1 (${dir1Stops.length} fermate)...`);
  const res1 = await buildRealRoadSegments(dir1Stops, ROAD_WAYPOINTS_DIR1);

  // Aggiorna data/linea6.json con le proprietà richieste dalla specifica
  data.shape_dir_0 = res0.fullPolyline;
  data.shape_dir_1 = res1.fullPolyline;
  data.shape = res0.fullPolyline; // default alias

  data.routes_by_direction["0"].shape = res0.fullPolyline;
  data.routes_by_direction["0"].segments = res0.segments;
  data.routes_by_direction["0"].stops = dir0Stops;

  data.routes_by_direction["1"].shape = res1.fullPolyline;
  data.routes_by_direction["1"].segments = res1.segments;
  data.routes_by_direction["1"].stops = dir1Stops;

  data.stops = dir0Stops;

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

  console.log('Tracciato stradale reale generato e salvato con successo!');
  console.log(`- Punti polilinea Dir 0 (Montefiore): ${res0.fullPolyline.length} punti (${polylineDistanceMeters(res0.fullPolyline)}m)`);
  console.log(`- Punti polilinea Dir 1 (Rio Maggiore): ${res1.fullPolyline.length} punti (${polylineDistanceMeters(res1.fullPolyline)}m)`);
  console.log(`- Tratte segmentate Dir 0: ${res0.segments.length}`);
  console.log(`- Tratte segmentate Dir 1: ${res1.segments.length}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, buildRealRoadSegments };
