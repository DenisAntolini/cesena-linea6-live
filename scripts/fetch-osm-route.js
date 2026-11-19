// scripts/fetch-osm-route.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'linea6.json');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

function cleanPolyline(points) {
  if (!points || points.length <= 1) return points || [];
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = points[i];
    const dist = haversineMeters(prev[0], prev[1], cur[0], cur[1]);
    if (dist < 1.0) continue;
    cleaned.push([Number(cur[0].toFixed(6)), Number(cur[1].toFixed(6))]);
  }
  return cleaned;
}

function stitchOsmRelation(data) {
  const nodeMap = new Map();
  const wayMap = new Map();
  let relation = null;
  for (const el of data.elements) {
    if (el.type === 'node') nodeMap.set(el.id, [el.lat, el.lon]);
    else if (el.type === 'way') wayMap.set(el.id, el.nodes);
    else if (el.type === 'relation') relation = el;
  }

  const wayMembers = relation.members.filter(m => m.type === 'way' && m.role !== 'platform' && m.role !== 'stop');
  const waysCoords = [];
  for (const m of wayMembers) {
    const nids = wayMap.get(m.ref);
    if (nids) {
      const c = nids.map(id => nodeMap.get(id)).filter(Boolean);
      if (c.length) waysCoords.push(c);
    }
  }

  let poly = [...waysCoords[0]];
  for (let i = 1; i < waysCoords.length; i++) {
    const cur = waysCoords[i];
    const tail = poly[poly.length - 1];
    const dHead = haversineMeters(tail[0], tail[1], cur[0][0], cur[0][1]);
    const dTail = haversineMeters(tail[0], tail[1], cur[cur.length - 1][0], cur[cur.length - 1][1]);
    let pts = [...cur];
    if (dTail < dHead) pts.reverse();

    const d = haversineMeters(tail[0], tail[1], pts[0][0], pts[0][1]);
    const toAdd = (d < 5) ? pts.slice(1) : pts;
    for (const p of toAdd) {
      const last = poly[poly.length - 1];
      if (haversineMeters(last[0], last[1], p[0], p[1]) > 0.5) {
        poly.push([Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
      }
    }
  }
  return cleanPolyline(poly);
}

async function main() {
  console.log('=== ESTRAZIONE TRACCIATO REALE LINEA 6 CESENA (OPENSTREETMAP) ===');

  // 1. Fetch OSM Relation 9969127 (Dir 0)
  console.log('[OSM] Recupero relazione OSM 9969127 (Dir 0: Torre del Moro -> Montefiore)...');
  const rel0Data = await fetchJson('https://api.openstreetmap.org/api/0.6/relation/9969127/full.json');
  const poly0 = stitchOsmRelation(rel0Data);

  // 2. Fetch OSM Relation 10051799 (Dir 1 eastern half: Montefiore -> Cesena FS)
  console.log('[OSM] Recupero relazione OSM 10051799 (Dir 1: Montefiore -> Cesena FS)...');
  const rel1Data = await fetchJson('https://api.openstreetmap.org/api/0.6/relation/10051799/full.json');
  const poly1Eastern = stitchOsmRelation(rel1Data);

  // 3. Extract vehicular connection from Cesena FS down to Ippodromo in reverse
  const CESENA_FS = [44.14507, 12.24943];
  let fsIdx0 = -1;
  let minFsDist = Infinity;
  for (let i = 0; i < poly0.length; i++) {
    const d = haversineMeters(CESENA_FS[0], CESENA_FS[1], poly0[i][0], poly0[i][1]);
    if (d < minFsDist) { minFsDist = d; fsIdx0 = i; }
  }

  const IPPODROMO = [44.14375, 12.22852];
  let ippoIdx0 = -1;
  let minIppoDist = Infinity;
  for (let i = 0; i < poly0.length; i++) {
    const d = haversineMeters(IPPODROMO[0], IPPODROMO[1], poly0[i][0], poly0[i][1]);
    if (d < minIppoDist) { minIppoDist = d; ippoIdx0 = i; }
  }

  const fsToIppoReverse = poly0.slice(ippoIdx0, fsIdx0 + 1).reverse();

  // 4. Fetch OSM map bbox for Cesena West vehicular roads
  console.log('[OSM] Recupero strade veicolari Cesena Ovest (Resistenza, Cattaneo, Nuvolari, Coppi)...');
  const bboxXml = await fetchText('https://api.openstreetmap.org/api/0.6/map?bbox=12.220,44.142,12.230,44.152');

  const nodeMap = new Map();
  const nodeMatches = bboxXml.matchAll(/<node id="(\d+)"[^>]*?lat="([^"]+)"[^>]*?lon="([^"]+)"/g);
  for (const m of nodeMatches) {
    nodeMap.set(m[1], [parseFloat(m[2]), parseFloat(m[3])]);
  }

  const ways = new Map();
  const wayMatches = bboxXml.matchAll(/<way id="(\d+)"[\s\S]*?<\/way>/g);
  for (const wm of wayMatches) {
    const xml = wm[0];
    const id = wm[1];
    const nameMatch = xml.match(/<tag k="name" v="([^"]+)"/);
    const hwMatch = xml.match(/<tag k="highway" v="([^"]+)"/);
    const ndMatches = [...xml.matchAll(/<nd ref="(\d+)"/g)].map(m => m[1]);
    ways.set(id, {
      id,
      name: nameMatch ? nameMatch[1] : null,
      highway: hwMatch ? hwMatch[1] : null,
      nodes: ndMatches
    });
  }

  const westWayIds = ['245122744', '862981944', '25626939', '25626904', '69488582', '718493458', '718493469'];
  const westCoords = [];
  for (const wid of westWayIds) {
    const w = ways.get(wid);
    if (w) {
      const c = w.nodes.map(nid => nodeMap.get(nid)).filter(Boolean);
      if (c.length) {
        if (westCoords.length === 0) {
          westCoords.push(...c);
        } else {
          const tail = westCoords[westCoords.length - 1];
          const dH = haversineMeters(tail[0], tail[1], c[0][0], c[0][1]);
          const dT = haversineMeters(tail[0], tail[1], c[c.length - 1][0], c[c.length - 1][1]);
          let pts = [...c];
          if (dT < dH) pts.reverse();
          const d = haversineMeters(tail[0], tail[1], pts[0][0], pts[0][1]);
          const toAdd = d < 5 ? pts.slice(1) : pts;
          westCoords.push(...toAdd);
        }
      }
    }
  }

  const shapeDir0 = cleanPolyline(poly0);
  const shapeDir1 = cleanPolyline([
    ...poly1Eastern,
    ...fsToIppoReverse,
    ...westCoords
  ]);

  console.log(`\nGeometrie generate: shape_dir_0 (${shapeDir0.length} pt), shape_dir_1 (${shapeDir1.length} pt)`);

  const linea6 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Calculate monotonic shape_index for Dir 0
  let prevIdx0 = 0;
  linea6.routes_by_direction['0'].stops.forEach(s => {
    let minDist = Infinity;
    let bestIdx = prevIdx0;
    for (let i = prevIdx0; i < shapeDir0.length; i++) {
      const d = haversineMeters(s.lat, s.lon, shapeDir0[i][0], shapeDir0[i][1]);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
      }
    }
    s.shape_index = bestIdx;
    s.lat = shapeDir0[bestIdx][0];
    s.lon = shapeDir0[bestIdx][1];
    prevIdx0 = bestIdx;
  });

  // Calculate monotonic shape_index for Dir 1
  let prevIdx1 = 0;
  linea6.routes_by_direction['1'].stops.forEach(s => {
    let minDist = Infinity;
    let bestIdx = prevIdx1;
    for (let i = prevIdx1; i < shapeDir1.length; i++) {
      const d = haversineMeters(s.lat, s.lon, shapeDir1[i][0], shapeDir1[i][1]);
      if (d < minDist) {
        minDist = d;
        bestIdx = i;
      }
    }
    s.shape_index = bestIdx;
    s.lat = shapeDir1[bestIdx][0];
    s.lon = shapeDir1[bestIdx][1];
    prevIdx1 = bestIdx;
  });

  linea6.shape_dir_0 = shapeDir0;
  linea6.shape_dir_1 = shapeDir1;
  linea6.routes_by_direction['0'].shape = shapeDir0;
  linea6.routes_by_direction['1'].shape = shapeDir1;

  fs.writeFileSync(DATA_FILE, JSON.stringify(linea6, null, 2), 'utf8');
  console.log('[SUCCESSO] data/linea6.json aggiornato con tracciati OSM ufficiali e indici monotoni.');
}

main().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
