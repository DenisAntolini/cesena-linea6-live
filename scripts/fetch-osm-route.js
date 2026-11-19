// scripts/fetch-osm-route.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_FILE = path.join(__dirname, '..', 'data', 'linea6.json');

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

const OVERPASS_QUERY = `[out:json][timeout:25];
(
  relation["type"="route"]["route"="bus"]["ref"="6"](44.11,12.19,44.17,12.29);
  relation["type"="route"]["route"="bus"]["ref"="CE06"](44.11,12.19,44.17,12.29);
);
out body;
>;
out skel qt;`;

const KNOWN_OSM_RELATIONS = {
  dir0: 9969127,  // 6 Torre Del Moro - Montefiore
  dir1: 10051799  // 6 Montefiore - Torre del Moro
};

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

function queryOverpassEndpoint(endpoint, query) {
  return new Promise((resolve, reject) => {
    const postData = 'data=' + encodeURIComponent(query);
    const url = new URL(endpoint);

    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${endpoint}: ${e.message}`));
          }
        } else {
          reject(new Error(`Overpass error ${res.statusCode} from ${endpoint}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${endpoint}`));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function fetchJsonHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function fetchJsonHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchOsrmConnector(p1, p2) {
  const url = `http://router.project-osrm.org/route/v1/foot/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?overview=full&geometries=geojson`;
  try {
    const res = await fetchJsonHttp(url);
    if (res.routes && res.routes[0] && res.routes[0].geometry) {
      return res.routes[0].geometry.coordinates.map(c => [
        Number(c[1].toFixed(6)),
        Number(c[0].toFixed(6))
      ]);
    }
  } catch (e) {}
  return [p1, p2];
}

function stitchOsmRelationElements(data, relId) {
  const nodeMap = new Map();
  const wayMap = new Map();
  let relation = null;

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way') {
      wayMap.set(el.id, el.nodes);
    } else if (el.type === 'relation') {
      if (!relId || el.id === relId) {
        relation = el;
      }
    }
  }

  if (!relation) return [];

  const wayMembers = (relation.members || []).filter(m => m.type === 'way' && m.role !== 'platform' && m.role !== 'stop');
  const waysCoords = [];
  for (const m of wayMembers) {
    const nodeIds = wayMap.get(m.ref);
    if (nodeIds) {
      const coords = nodeIds.map(nid => nodeMap.get(nid)).filter(Boolean);
      if (coords.length > 0) {
        waysCoords.push(coords);
      }
    }
  }

  if (waysCoords.length === 0) return [];

  let poly = [...waysCoords[0]];
  for (let i = 1; i < waysCoords.length; i++) {
    const cur = waysCoords[i];
    const tail = poly[poly.length - 1];
    const dHead = haversineDistMeters(tail[0], tail[1], cur[0][0], cur[0][1]);
    const dTail = haversineDistMeters(tail[0], tail[1], cur[cur.length - 1][0], cur[cur.length - 1][1]);
    let pts = [...cur];
    if (dTail < dHead) pts.reverse();

    const d = haversineDistMeters(tail[0], tail[1], pts[0][0], pts[0][1]);
    const toAdd = (d < 5) ? pts.slice(1) : pts;
    for (const p of toAdd) {
      const last = poly[poly.length - 1];
      if (haversineDistMeters(last[0], last[1], p[0], p[1]) > 0.5) {
        poly.push([Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
      }
    }
  }

  return cleanPolyline(poly);
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
  console.log('=== ESTRAZIONE TRACCIATO REALE LINEA 6 CESENA (OPENSTREETMAP) ===');
  const linea6Data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  const RIO_MAGGIORE = [44.1524, 12.2225];
  const MONTEFIORE = [44.1305, 12.2642];

  let rawPoly0 = null;
  let rawPoly1 = null;

  // 1. Prova prima con Overpass API
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[OSM] Tentativo Overpass su ${ep}...`);
      const data = await queryOverpassEndpoint(ep, OVERPASS_QUERY);
      if (data && data.elements && data.elements.length > 0) {
        console.log(`[OSM] Risposta valida da ${ep} (${data.elements.length} elementi)`);
        rawPoly0 = stitchOsmRelationElements(data, KNOWN_OSM_RELATIONS.dir0);
        rawPoly1 = stitchOsmRelationElements(data, KNOWN_OSM_RELATIONS.dir1);
        if (rawPoly0.length > 50 && rawPoly1.length > 50) {
          console.log('[OSM] Entrambe le relazioni estratte con successo da Overpass.');
          break;
        }
      }
    } catch (err) {
      console.warn(`[OSM] Overpass fallito (${ep}): ${err.message}`);
    }
  }

  // 2. Fallback diretto sull'API ufficiale OSM se Overpass è occupato o parziale
  if (!rawPoly0 || rawPoly0.length < 50) {
    console.log(`[OSM API] Recupero relazione ${KNOWN_OSM_RELATIONS.dir0} direttamente dall'API OpenStreetMap...`);
    const d0 = await fetchJsonHttps(`https://api.openstreetmap.org/api/0.6/relation/${KNOWN_OSM_RELATIONS.dir0}/full.json`);
    rawPoly0 = stitchOsmRelationElements(d0, KNOWN_OSM_RELATIONS.dir0);
  }

  if (!rawPoly1 || rawPoly1.length < 50) {
    console.log(`[OSM API] Recupero relazione ${KNOWN_OSM_RELATIONS.dir1} direttamente dall'API OpenStreetMap...`);
    const d1 = await fetchJsonHttps(`https://api.openstreetmap.org/api/0.6/relation/${KNOWN_OSM_RELATIONS.dir1}/full.json`);
    rawPoly1 = stitchOsmRelationElements(d1, KNOWN_OSM_RELATIONS.dir1);
  }

  if (!rawPoly0 || rawPoly0.length === 0) {
    throw new Error('Impossibile estrarre la relazione OSM Dir 0 (9969127).');
  }

  console.log(`[OSM] rawPoly0 (Torre del Moro -> Montefiore): ${rawPoly0.length} vertici`);
  console.log(`[OSM] rawPoly1 (Montefiore -> Cesena FS): ${rawPoly1.length} vertici`);

  // Connessione continua per Dir 0 (Rio Maggiore -> Montefiore)
  const connRio0 = await fetchOsrmConnector(RIO_MAGGIORE, rawPoly0[0]);
  const connMonte0 = await fetchOsrmConnector(rawPoly0[rawPoly0.length - 1], MONTEFIORE);
  const shapeDir0 = cleanPolyline([
    ...connRio0.slice(0, -1),
    ...rawPoly0,
    ...connMonte0.slice(1)
  ]);

  // Connessione continua per Dir 1 (Montefiore -> Rio Maggiore)
  // Starts at Montefiore, follows poly1 to Cesena FS, then follows western half from Cesena FS back to Rio Maggiore
  const connMonte1 = await fetchOsrmConnector(MONTEFIORE, rawPoly1[0]);
  const CESENA_FS = [44.1466, 12.24755];
  let fsIdx0 = 0;
  let minFsDist = Infinity;
  for (let i = 0; i < shapeDir0.length; i++) {
    const dist = haversineDistMeters(CESENA_FS[0], CESENA_FS[1], shapeDir0[i][0], shapeDir0[i][1]);
    if (dist < minFsDist) {
      minFsDist = dist;
      fsIdx0 = i;
    }
  }

  const westernHalf = shapeDir0.slice(0, fsIdx0 + 1).reverse();
  const connFs = await fetchOsrmConnector(rawPoly1[rawPoly1.length - 1], westernHalf[0]);

  const shapeDir1 = cleanPolyline([
    ...connMonte1.slice(0, -1),
    ...rawPoly1,
    ...connFs.slice(1, -1),
    ...westernHalf
  ]);

  const stats0 = getPolylineStats(shapeDir0);
  const stats1 = getPolylineStats(shapeDir1);

  console.log(`\n========================================`);
  console.log(`DIAGNOSTICA SHAPE DIR 0 (Verso Montefiore):`);
  console.log(` - Punti totali: ${stats0.count}`);
  console.log(` - Lunghezza tracciato: ${stats0.km} km`);
  console.log(` - Salto massimo tra punti consecutivi: ${stats0.maxJumpMeters} m`);
  console.log(`========================================`);
  console.log(`DIAGNOSTICA SHAPE DIR 1 (Verso Rio Maggiore):`);
  console.log(` - Punti totali: ${stats1.count}`);
  console.log(` - Lunghezza tracciato: ${stats1.km} km`);
  console.log(` - Salto massimo tra punti consecutivi: ${stats1.maxJumpMeters} m`);
  console.log(`========================================`);

  // Salva in data/linea6.json preservando tutte le fermate
  linea6Data.shape_dir_0 = shapeDir0;
  linea6Data.shape_dir_1 = shapeDir1;

  if (linea6Data.routes_by_direction) {
    if (linea6Data.routes_by_direction['0']) {
      linea6Data.routes_by_direction['0'].shape = shapeDir0;
    }
    if (linea6Data.routes_by_direction['1']) {
      linea6Data.routes_by_direction['1'].shape = shapeDir1;
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(linea6Data, null, 2), 'utf8');
  console.log(`\n[SUCCESSO] data/linea6.json aggiornato con le geometrie reali OpenStreetMap!`);
}

main().catch(err => {
  console.error('[ERRORE FATALE]', err);
  process.exit(1);
});
