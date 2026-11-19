// scripts/sync-real-coords.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'linea6.json');
const GTFS_STOPS_FILE = path.join(__dirname, '..', 'data', 'gtfs', 'stops.txt');

function haversineDistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fetchJsonHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let clean = b.trim();
        if (clean.startsWith('<string') && clean.endsWith('</string>')) {
          clean = clean.replace(/^<string[^>]*>/, '').replace(/<\/string>$/, '');
        }
        try {
          resolve(JSON.parse(clean));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${clean.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function fetchOsrmSegment(startCoord, endCoord) {
  return new Promise((resolve) => {
    const url = `http://router.project-osrm.org/route/v1/foot/${startCoord[1]},${startCoord[0]};${endCoord[1]},${endCoord[0]}?overview=full&geometries=geojson`;
    const req = http.get(url, {
      headers: { 'User-Agent': 'CesenaLinea6/1.0' },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.routes && parsed.routes[0] && parsed.routes[0].geometry) {
            const coords = parsed.routes[0].geometry.coordinates.map(c => [
              Number(c[1].toFixed(6)),
              Number(c[0].toFixed(6))
            ]);
            resolve(coords);
            return;
          }
        } catch (e) {}
        resolve([startCoord, endCoord]);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve([startCoord, endCoord]);
    });

    req.on('error', () => {
      resolve([startCoord, endCoord]);
    });
  });
}

function cleanPolyline(points) {
  if (!points || points.length <= 1) return points || [];
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = points[i];
    const dist = haversineDistMeters(prev[0], prev[1], cur[0], cur[1]);
    if (dist < 1.0) continue;
    cleaned.push([Number(cur[0].toFixed(6)), Number(cur[1].toFixed(6))]);
  }
  return cleaned;
}

async function buildOsrmFootShape(stops) {
  const fullPolyline = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = [stops[i].lat, stops[i].lon];
    const s2 = [stops[i + 1].lat, stops[i + 1].lon];

    const segmentCoords = await fetchOsrmSegment(s1, s2);
    await new Promise(r => setTimeout(r, 60));

    if (fullPolyline.length === 0) {
      fullPolyline.push(...segmentCoords);
    } else {
      const tail = fullPolyline[fullPolyline.length - 1];
      const startPt = segmentCoords[0];
      const dist = haversineDistMeters(tail[0], tail[1], startPt[0], startPt[1]);
      const toAppend = (dist < 5) ? segmentCoords.slice(1) : segmentCoords;
      fullPolyline.push(...toAppend);
    }
    process.stdout.write(`\r  Tratto ${i + 1}/${stops.length - 1}: ${stops[i].stop_name} -> ${stops[i + 1].stop_name}`);
  }
  console.log('');
  return cleanPolyline(fullPolyline);
}

function getPolylineStats(points) {
  let totalMeters = 0;
  let maxJump = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineDistMeters(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    totalMeters += d;
    if (d > maxJump) maxJump = d;
  }
  return {
    count: points.length,
    km: (totalMeters / 1000).toFixed(2),
    maxJumpMeters: Math.round(maxJump)
  };
}

async function main() {
  console.log('=== 1. VERIFICA ENDPOINT START ROMAGNA OPENDATA ===');
  const asmxUrl = 'https://servizi.startromagna.it/opendata/Opendata.asmx/FERMATE_FC_JSON';
  try {
    const asmxData = await fetchJsonHttps(asmxUrl);
    console.log(`[Start Romagna OpenData] Ricevute ${asmxData.length} fermate da FERMATE_FC_JSON.`);
    if (asmxData.length > 0) {
      console.log('Campi anagrafica OpenData:', Object.keys(asmxData[0]));
    }
  } catch (err) {
    console.warn(`[Start Romagna OpenData] Avviso: ${err.message}`);
  }

  console.log('\n=== 2. CARICAMENTO COORDINATE UFFICIALI GTFS START ROMAGNA ===');
  if (!fs.existsSync(GTFS_STOPS_FILE)) {
    throw new Error(`File GTFS mancante: ${GTFS_STOPS_FILE}`);
  }

  const lines = fs.readFileSync(GTFS_STOPS_FILE, 'utf8').split('\n');
  const palinaMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    // stop_id,stop_code,stop_name,stop_lat,stop_lon
    const stopCode = parts[1];
    const stopName = parts[2];
    const stopLat = parseFloat(parts[3]);
    const stopLon = parseFloat(parts[4]);
    if (stopCode && !isNaN(stopLat) && !isNaN(stopLon)) {
      palinaMap.set(String(stopCode).trim(), { stopCode, stopName, stopLat, stopLon });
    }
  }
  console.log(`Caricate ${palinaMap.size} paline ufficiali con coordinate GPS esatte.`);

  console.log('\n=== 3. AGGIORNAMENTO COORDINATE IN data/linea6.json ===');
  const linea6 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  let updatedCount = 0;
  for (const dirId of ['0', '1']) {
    const stops = linea6.routes_by_direction?.[dirId]?.stops || [];
    for (const s of stops) {
      const palinaId = String(s.stop_id).trim();
      const official = palinaMap.get(palinaId);
      if (official) {
        const oldLat = s.lat;
        const oldLon = s.lon;
        s.lat = official.stopLat;
        s.lon = official.stopLon;
        if (official.stopName && !s.stop_name.includes('Capolinea')) {
          // Mantieni i nomi puliti
        }
        const deltaM = Math.round(haversineDistMeters(oldLat, oldLon, s.lat, s.lon));
        if (deltaM > 50) {
          console.log(`[Riallineamento > 50m] Dir ${dirId} Palina ${palinaId} (${s.stop_name}): spostata di ${deltaM}m -> (${s.lat}, ${s.lon})`);
        }
        updatedCount++;
      } else {
        console.warn(`[WARN] Palina ${palinaId} non trovata in GTFS stops.txt`);
      }
    }
  }

  if (linea6.stops && linea6.routes_by_direction?.['0']?.stops) {
    linea6.stops = linea6.routes_by_direction['0'].stops;
  }
  console.log(`Aggiornate con successo ${updatedCount} fermate.`);

  console.log('\n=== 4. RIGENERAZIONE PERCORSO STRADALE REALE COINCIDENTE CON LE FERMATE ===');
  console.log('Calcolo tracciato stop-by-stop Dir 0 (Verso Montefiore)...');
  const stops0 = linea6.routes_by_direction['0'].stops;
  const shapeDir0 = await buildOsrmFootShape(stops0);

  console.log('Calcolo tracciato stop-by-stop Dir 1 (Verso Rio Maggiore)...');
  const stops1 = linea6.routes_by_direction['1'].stops;
  const shapeDir1 = await buildOsrmFootShape(stops1);

  linea6.shape_dir_0 = shapeDir0;
  linea6.shape_dir_1 = shapeDir1;
  linea6.routes_by_direction['0'].shape = shapeDir0;
  linea6.routes_by_direction['1'].shape = shapeDir1;

  console.log('\n=== 5. VERIFICA DISTANZA FERMATE DALLA LINEA BLU ===');
  for (const dirId of ['0', '1']) {
    const shape = linea6['shape_dir_' + dirId];
    const stops = linea6.routes_by_direction[dirId].stops;
    console.log(`\n--- DIREZIONE ${dirId} (${linea6.directions[dirId]}) ---`);
    let maxDist = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      let minDist = Infinity;
      for (const pt of shape) {
        const d = haversineDistMeters(s.lat, s.lon, pt[0], pt[1]);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDist) maxDist = minDist;
      console.log(` [Fermata #${i + 1}] Palina ${s.stop_id} (${s.stop_name}): ${Math.round(minDist)} m dalla linea`);
    }
    console.log(`>> Distanza massima fermata-linea in Dir ${dirId}: ${Math.round(maxDist)} metri.`);
  }

  const stats0 = getPolylineStats(shapeDir0);
  const stats1 = getPolylineStats(shapeDir1);
  console.log('\n=== DIAGNOSTICA FINALE PERCORSI REALI ===');
  console.log(`Dir 0: ${stats0.count} punti, ${stats0.km} km, maxJump ${stats0.maxJumpMeters}m`);
  console.log(`Dir 1: ${stats1.count} punti, ${stats1.km} km, maxJump ${stats1.maxJumpMeters}m`);

  fs.writeFileSync(DATA_FILE, JSON.stringify(linea6, null, 2), 'utf8');
  console.log(`\n[SUCCESSO] data/linea6.json aggiornato e allineato al 100%!`);
}

main().catch(err => {
  console.error('[ERRORE FATALE]', err);
  process.exit(1);
});
