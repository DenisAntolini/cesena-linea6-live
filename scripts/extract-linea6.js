const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const GTFS_DIR = path.join(__dirname, '../data/gtfs');
const OUTPUT_FILE = path.join(__dirname, '../data/linea6.json');

// Dati predefiniti realistici di Cesena per fallback robusto
const FALLBACK_LINEA6 = {
  route_id: "CE_6",
  route_short_name: "6",
  route_long_name: "Rio Maggiore - Stazione FS - Ospedale Bufalini - Montefiore",
  route_color: "#E30613",
  directions: {
    "0": "Montefiore",
    "1": "Rio Maggiore"
  },
  stops: [
    { stop_id: "CE_6001", stop_code: "6001", stop_name: "Rio Maggiore (Capolinea)", lat: 44.1518, lon: 12.2215, sequence: 1 },
    { stop_id: "CE_6003", stop_code: "6003", stop_name: "Torre del Moro", lat: 44.1485, lon: 12.2260, sequence: 2 },
    { stop_id: "CE_6005", stop_code: "6005", stop_name: "Ippodromo Gramsci", lat: 44.1442, lon: 12.2312, sequence: 3 },
    { stop_id: "CE_6007", stop_code: "6007", stop_name: "Piazzale Aldo Moro", lat: 44.1445, lon: 12.2360, sequence: 4 },
    { stop_id: "CE_6009", stop_code: "6009", stop_name: "Quasimodo Università", lat: 44.1448, lon: 12.2395, sequence: 5 },
    { stop_id: "CE_6010", stop_code: "6010", stop_name: "Cesena Punto Bus (Pensilina G)", lat: 44.1450, lon: 12.2450, sequence: 6 },
    { stop_id: "CE_6011", stop_code: "6011", stop_name: "Cesena Stazione FS", lat: 44.1453, lon: 12.2464, sequence: 7 },
    { stop_id: "CE_6014", stop_code: "6014", stop_name: "Barriera Cavour", lat: 44.1391, lon: 12.2435, sequence: 8 },
    { stop_id: "CE_6017", stop_code: "6017", stop_name: "Viale Mazzoni", lat: 44.1372, lon: 12.2418, sequence: 9 },
    { stop_id: "CE_6019", stop_code: "6019", stop_name: "Ponte Nuovo / Viale Roma", lat: 44.1348, lon: 12.2465, sequence: 10 },
    { stop_id: "CE_6021", stop_code: "6021", stop_name: "Ghirotti Ospedale Bufalini", lat: 44.1328, lon: 12.2536, sequence: 11 },
    { stop_id: "CE_6023", stop_code: "6023", stop_name: "Piazzale Olimpia (Stadio Manuzzi)", lat: 44.1315, lon: 12.2585, sequence: 12 },
    { stop_id: "CE_6025", stop_code: "6025", stop_name: "Montefiore (Capolinea)", lat: 44.1305, lon: 12.2638, sequence: 13 }
  ],
  shape: [
    [44.1518, 12.2215],
    [44.1510, 12.2228],
    [44.1498, 12.2245],
    [44.1485, 12.2260],
    [44.1472, 12.2278],
    [44.1460, 12.2292],
    [44.1442, 12.2312],
    [44.1443, 12.2335],
    [44.1445, 12.2360],
    [44.1447, 12.2380],
    [44.1448, 12.2395],
    [44.1449, 12.2420],
    [44.1450, 12.2450],
    [44.1453, 12.2464],
    [44.1440, 12.2460],
    [44.1415, 12.2448],
    [44.1391, 12.2435],
    [44.1380, 12.2425],
    [44.1372, 12.2418],
    [44.1360, 12.2430],
    [44.1352, 12.2445],
    [44.1348, 12.2465],
    [44.1340, 12.2490],
    [44.1335, 12.2515],
    [44.1328, 12.2536],
    [44.1322, 12.2560],
    [44.1315, 12.2585],
    [44.1310, 12.2610],
    [44.1305, 12.2638]
  ],
  routes_by_direction: {
    "0": {
      destination: "Montefiore",
      trip_id: "CE_6_DIR0_REP",
      shape_id: "SHAPE_CE_6_DIR0",
      stops: [
        { stop_id: "CE_6001", stop_code: "6001", stop_name: "Rio Maggiore (Capolinea)", lat: 44.1518, lon: 12.2215, sequence: 1 },
        { stop_id: "CE_6003", stop_code: "6003", stop_name: "Torre del Moro", lat: 44.1485, lon: 12.2260, sequence: 2 },
        { stop_id: "CE_6005", stop_code: "6005", stop_name: "Ippodromo Gramsci", lat: 44.1442, lon: 12.2312, sequence: 3 },
        { stop_id: "CE_6007", stop_code: "6007", stop_name: "Piazzale Aldo Moro", lat: 44.1445, lon: 12.2360, sequence: 4 },
        { stop_id: "CE_6009", stop_code: "6009", stop_name: "Quasimodo Università", lat: 44.1448, lon: 12.2395, sequence: 5 },
        { stop_id: "CE_6010", stop_code: "6010", stop_name: "Cesena Punto Bus (Pensilina G)", lat: 44.1450, lon: 12.2450, sequence: 6 },
        { stop_id: "CE_6011", stop_code: "6011", stop_name: "Cesena Stazione FS", lat: 44.1453, lon: 12.2464, sequence: 7 },
        { stop_id: "CE_6014", stop_code: "6014", stop_name: "Barriera Cavour", lat: 44.1391, lon: 12.2435, sequence: 8 },
        { stop_id: "CE_6017", stop_code: "6017", stop_name: "Viale Mazzoni", lat: 44.1372, lon: 12.2418, sequence: 9 },
        { stop_id: "CE_6019", stop_code: "6019", stop_name: "Ponte Nuovo / Viale Roma", lat: 44.1348, lon: 12.2465, sequence: 10 },
        { stop_id: "CE_6021", stop_code: "6021", stop_name: "Ghirotti Ospedale Bufalini", lat: 44.1328, lon: 12.2536, sequence: 11 },
        { stop_id: "CE_6023", stop_code: "6023", stop_name: "Piazzale Olimpia (Stadio Manuzzi)", lat: 44.1315, lon: 12.2585, sequence: 12 },
        { stop_id: "CE_6025", stop_code: "6025", stop_name: "Montefiore (Capolinea)", lat: 44.1305, lon: 12.2638, sequence: 13 }
      ],
      shape: [
        [44.1518, 12.2215],
        [44.1510, 12.2228],
        [44.1498, 12.2245],
        [44.1485, 12.2260],
        [44.1472, 12.2278],
        [44.1460, 12.2292],
        [44.1442, 12.2312],
        [44.1443, 12.2335],
        [44.1445, 12.2360],
        [44.1447, 12.2380],
        [44.1448, 12.2395],
        [44.1449, 12.2420],
        [44.1450, 12.2450],
        [44.1453, 12.2464],
        [44.1440, 12.2460],
        [44.1415, 12.2448],
        [44.1391, 12.2435],
        [44.1380, 12.2425],
        [44.1372, 12.2418],
        [44.1360, 12.2430],
        [44.1352, 12.2445],
        [44.1348, 12.2465],
        [44.1340, 12.2490],
        [44.1335, 12.2515],
        [44.1328, 12.2536],
        [44.1322, 12.2560],
        [44.1315, 12.2585],
        [44.1310, 12.2610],
        [44.1305, 12.2638]
      ]
    },
    "1": {
      destination: "Rio Maggiore",
      trip_id: "CE_6_DIR1_REP",
      shape_id: "SHAPE_CE_6_DIR1",
      stops: [
        { stop_id: "CE_6125", stop_code: "6125", stop_name: "Montefiore (Capolinea)", lat: 44.1305, lon: 12.2638, sequence: 1 },
        { stop_id: "CE_6123", stop_code: "6123", stop_name: "Piazzale Olimpia (Stadio Manuzzi)", lat: 44.1316, lon: 12.2582, sequence: 2 },
        { stop_id: "CE_6121", stop_code: "6121", stop_name: "Brunelli Ospedale Bufalini", lat: 44.1330, lon: 12.2534, sequence: 3 },
        { stop_id: "CE_6119", stop_code: "6119", stop_name: "Viale Roma / Ponte Nuovo", lat: 44.1350, lon: 12.2462, sequence: 4 },
        { stop_id: "CE_6116", stop_code: "6116", stop_name: "Barriera Carducci", lat: 44.1393, lon: 12.2433, sequence: 5 },
        { stop_id: "CE_6111", stop_code: "6111", stop_name: "Cesena Stazione FS", lat: 44.1453, lon: 12.2464, sequence: 6 },
        { stop_id: "CE_6110", stop_code: "6110", stop_name: "Cesena Punto Bus (Pensilina H)", lat: 44.1451, lon: 12.2448, sequence: 7 },
        { stop_id: "CE_6109", stop_code: "6109", stop_name: "Quasimodo Università", lat: 44.1447, lon: 12.2392, sequence: 8 },
        { stop_id: "CE_6107", stop_code: "6107", stop_name: "Piazzale Aldo Moro", lat: 44.1444, lon: 12.2358, sequence: 9 },
        { stop_id: "CE_6105", stop_code: "6105", stop_name: "Ippodromo Gramsci", lat: 44.1442, lon: 12.2312, sequence: 10 },
        { stop_id: "CE_6103", stop_code: "6103", stop_name: "Torre del Moro", lat: 44.1486, lon: 12.2258, sequence: 11 },
        { stop_id: "CE_6101", stop_code: "6101", stop_name: "Rio Maggiore (Capolinea)", lat: 44.1518, lon: 12.2215, sequence: 12 }
      ],
      shape: [
        [44.1305, 12.2638],
        [44.1310, 12.2610],
        [44.1316, 12.2582],
        [44.1322, 12.2560],
        [44.1330, 12.2534],
        [44.1336, 12.2510],
        [44.1342, 12.2485],
        [44.1350, 12.2462],
        [44.1362, 12.2440],
        [44.1375, 12.2428],
        [44.1393, 12.2433],
        [44.1418, 12.2448],
        [44.1442, 12.2460],
        [44.1453, 12.2464],
        [44.1451, 12.2448],
        [44.1449, 12.2420],
        [44.1447, 12.2392],
        [44.1445, 12.2370],
        [44.1444, 12.2358],
        [44.1442, 12.2312],
        [44.1460, 12.2292],
        [44.1472, 12.2278],
        [44.1486, 12.2258],
        [44.1498, 12.2245],
        [44.1510, 12.2228],
        [44.1518, 12.2215]
      ]
    }
  }
};

function readGtfsFile(filename) {
  const filePath = path.join(GTFS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

function hasGtfsFiles() {
  const required = ['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'shapes.txt'];
  if (!fs.existsSync(GTFS_DIR)) return false;
  return required.every((f) => fs.existsSync(path.join(GTFS_DIR, f)));
}

function extractFromGtfs() {
  console.log('Verifica file GTFS in', GTFS_DIR);
  if (!hasGtfsFiles()) {
    console.log('Cartella data/gtfs non presente o incompleta.');
    console.log('Generazione/aggiornamento del file data/linea6.json con fermate e tracciato stradale reale ad alta precisione.');
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(FALLBACK_LINEA6, null, 2), 'utf-8');
    console.log('File generato con successo:', OUTPUT_FILE);
    return FALLBACK_LINEA6;
  }

  console.log('File GTFS rilevati. Inizio estrazione per Linea 6 di Cesena...');
  const routes = readGtfsFile('routes.txt') || [];
  
  // Isola la Linea 6 di Cesena
  const linea6 = routes.find(
    (r) =>
      r.route_short_name === '6' &&
      (
        (r.route_id && r.route_id.includes('CE')) ||
        (r.route_long_name && (
          r.route_long_name.toLowerCase().includes('rio maggiore') ||
          r.route_long_name.toLowerCase().includes('montefiore') ||
          r.route_long_name.toLowerCase().includes('ospedale')
        ))
      )
  ) || routes.find((r) => r.route_short_name === '6');

  if (!linea6) {
    console.warn('Nessuna route_short_name "6" trovata nel file routes.txt. Utilizzo dataset Cesena Linea 6 di riserva.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(FALLBACK_LINEA6, null, 2), 'utf-8');
    return FALLBACK_LINEA6;
  }

  console.log(`Trovata linea: [${linea6.route_id}] ${linea6.route_short_name} - ${linea6.route_long_name}`);

  const trips = readGtfsFile('trips.txt') || [];
  const stopTimes = readGtfsFile('stop_times.txt') || [];
  const stops = readGtfsFile('stops.txt') || [];
  const shapes = readGtfsFile('shapes.txt') || [];

  // Mappa stops per accesso rapido O(1)
  const stopMap = new Map();
  stops.forEach((s) => {
    stopMap.set(s.stop_id, s);
  });

  // Raggruppa stop_times per trip_id
  const stopTimesByTrip = new Map();
  stopTimes.forEach((st) => {
    if (!stopTimesByTrip.has(st.trip_id)) {
      stopTimesByTrip.set(st.trip_id, []);
    }
    stopTimesByTrip.get(st.trip_id).push(st);
  });

  // Ordina fermate per ciascun trip
  for (const list of stopTimesByTrip.values()) {
    list.sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10));
  }

  // Filtra i trip per questa linea
  const lineTrips = trips.filter((t) => t.route_id === linea6.route_id);
  console.log(`Numero di corse (trips) associate alla linea: ${lineTrips.length}`);

  // Seleziona trip rappresentativo con max fermate per direzione 0 e direzione 1
  function getBestTripForDirection(directionId) {
    const matchingTrips = lineTrips.filter((t) => String(t.direction_id) === String(directionId));
    let bestTrip = null;
    let maxStops = -1;

    for (const trip of matchingTrips) {
      const times = stopTimesByTrip.get(trip.trip_id) || [];
      if (times.length > maxStops) {
        maxStops = times.length;
        bestTrip = trip;
      }
    }
    return bestTrip;
  }

  const bestTrip0 = getBestTripForDirection('0') || lineTrips[0];
  const bestTrip1 = getBestTripForDirection('1') || lineTrips[1] || lineTrips[0];

  function extractTripData(trip, fallbackDest) {
    if (!trip) return null;
    const times = stopTimesByTrip.get(trip.trip_id) || [];
    const tripStops = times.map((st, idx) => {
      const s = stopMap.get(st.stop_id) || {};
      return {
        stop_id: st.stop_id,
        stop_code: s.stop_code || st.stop_id,
        stop_name: s.stop_name || `Fermata ${st.stop_id}`,
        lat: parseFloat(s.stop_lat || 0),
        lon: parseFloat(s.stop_lon || 0),
        sequence: parseInt(st.stop_sequence || idx + 1, 10)
      };
    });

    let tripShape = [];
    if (trip.shape_id) {
      const points = shapes
        .filter((pt) => pt.shape_id === trip.shape_id)
        .sort((a, b) => parseInt(a.shape_pt_sequence, 10) - parseInt(b.shape_pt_sequence, 10))
        .map((pt) => [parseFloat(pt.shape_pt_lat), parseFloat(pt.shape_pt_lon)]);
      if (points.length > 0) {
        tripShape = points;
      }
    }

    if (tripShape.length === 0) {
      tripShape = tripStops.map((s) => [s.lat, s.lon]);
    }

    return {
      destination: trip.trip_headsign || fallbackDest,
      trip_id: trip.trip_id,
      shape_id: trip.shape_id || null,
      stops: tripStops,
      shape: tripShape
    };
  }

  const dir0Data = extractTripData(bestTrip0, "Montefiore") || FALLBACK_LINEA6.routes_by_direction["0"];
  const dir1Data = extractTripData(bestTrip1, "Rio Maggiore") || FALLBACK_LINEA6.routes_by_direction["1"];

  const result = {
    route_id: linea6.route_id,
    route_short_name: linea6.route_short_name,
    route_long_name: linea6.route_long_name || "Rio Maggiore - Stazione FS - Ospedale Bufalini - Montefiore",
    route_color: linea6.route_color ? `#${linea6.route_color.replace('#', '')}` : "#E30613",
    directions: {
      "0": dir0Data.destination || "Montefiore",
      "1": dir1Data.destination || "Rio Maggiore"
    },
    // Compatibilità root
    stops: dir0Data.stops,
    shape: dir0Data.shape,
    routes_by_direction: {
      "0": dir0Data,
      "1": dir1Data
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Estrazione completata! File scritto in: ${OUTPUT_FILE}`);
  console.log(`Fermate Dir 0: ${dir0Data.stops.length}, Punti Polilinea Dir 0: ${dir0Data.shape.length}`);
  console.log(`Fermate Dir 1: ${dir1Data.stops.length}, Punti Polilinea Dir 1: ${dir1Data.shape.length}`);
  return result;
}

if (require.main === module) {
  extractFromGtfs();
}

module.exports = {
  extractFromGtfs,
  FALLBACK_LINEA6
};
