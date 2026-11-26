/**
 * scripts/patch-campus-route.js
 * Ricostruisce su data/linea6.json la geometria stradale reale zona Campus / Quasimodo / Viale Europa:
 * - Rimuove il vecchio ramo dietro Centro Commerciale Lungo Savio (Via Umberto Saba) e l'occhiello su Viale Europa vicino a Via Fornaci
 * - Ricostruisce il tracciato reale lungo Via Italo Calvino -> Via Salvatore Quasimodo (salita passando per #6721)
 *   -> Rotonda Ignazio Silone (inversione antioraria) -> Via Salvatore Quasimodo (discesa oltre Via Calvino fino a Viale Europa)
 *   -> Viale Europa (svolta a sinistra fino a Europa #12681)
 * - Ripulisce shape_dir_1 su Viale Europa / Campus usando i reali sensi di marcia di Rotonda Panathlon e Via Quasimodo
 * - Ricalcola tutti i shape_index strettamente monotoni crescenti per entrambe le direzioni
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '..', 'data', 'linea6.json');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CesenaLinea6/1.0 (info@cesena.it)' } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} per ${url}`));
      }
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

function parseOsmBbox(xml) {
  const nodeMap = new Map();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([^"]+)"[^>]*?lon="([^"]+)"/g)) {
    nodeMap.set(m[1], [
      Number(parseFloat(m[2]).toFixed(6)),
      Number(parseFloat(m[3]).toFixed(6))
    ]);
  }
  const wayNodesMap = new Map();
  for (const wm of xml.matchAll(/<way id="(\d+)"[\s\S]*?<\/way>/g)) {
    const nds = [...wm[0].matchAll(/<nd ref="(\d+)"/g)].map(m => m[1]);
    wayNodesMap.set(wm[1], nds);
  }
  return { nodeMap, wayNodesMap };
}

/**
 * Estrae una sequenza di nodeId da una way OSM da `fromNodeId` a `toNodeId`,
 * invertendo automaticamente se necessario.
 */
function sliceWayNodes(wayNodesMap, wayId, fromNodeId, toNodeId) {
  const nds = wayNodesMap.get(String(wayId));
  if (!nds) {
    throw new Error(`Way OSM ${wayId} non trovata nell'area scaricata`);
  }
  const idxFrom = nds.indexOf(String(fromNodeId));
  const idxTo = nds.indexOf(String(toNodeId));
  if (idxFrom === -1 || idxTo === -1) {
    throw new Error(`Nodi (${fromNodeId} -> ${toNodeId}) mancanti in Way ${wayId}`);
  }
  if (idxFrom <= idxTo) {
    return nds.slice(idxFrom, idxTo + 1);
  }
  return nds.slice(idxTo, idxFrom + 1).reverse();
}

/**
 * Concatena una lista di segmenti di node ID preservando esattamente andate e ritorni,
 * rimuovendo soltanto i duplicati consecutivi identici (< 0.3m).
 */
function concatNodeSegmentsToCoords(segments, nodeMap) {
  const coords = [];
  for (const seg of segments) {
    for (const nid of seg) {
      const pt = nodeMap.get(String(nid));
      if (!pt) throw new Error(`Nodo OSM ${nid} non trovato`);
      if (coords.length === 0) {
        coords.push(pt);
      } else {
        const last = coords[coords.length - 1];
        if (haversineMeters(last[0], last[1], pt[0], pt[1]) >= 0.3) {
          coords.push(pt);
        }
      }
    }
  }
  return coords;
}

function findClosestShapeIndex(shape, targetCoord, fromIdx = 0, toIdx = shape.length - 1) {
  let bestIdx = fromIdx;
  let minDist = Infinity;
  const end = Math.min(shape.length - 1, toIdx);
  for (let i = Math.max(0, fromIdx); i <= end; i++) {
    const d = haversineMeters(targetCoord[0], targetCoord[1], shape[i][0], shape[i][1]);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: minDist };
}

/**
 * Calcola gli indici monotoni crescenti delle fermate su `shape`,
 * gestendo il doppio passaggio su Via Quasimodo.
 */
function recomputeMonotonicStopIndices(stops, shape, dirId) {
  // Trova apice Rotonda Ignazio Silone nella polilinea per distinguere salita NW e discesa SE su Via Quasimodo
  const siloneNorthVertex = [44.147388, 12.234958];
  const siloneApex = findClosestShapeIndex(shape, siloneNorthVertex, 0, shape.length - 1).idx;

  let prevIdx = 0;
  for (const s of stops) {
    const sid = String(s.stop_id);
    let upperBound = shape.length - 1;

    // 6721 Quasimodo (salita NW) deve sempre collocarsi PRIMA della rotonda nord (Rotonda Ignazio Silone)
    if (sid === '6721' && siloneApex > prevIdx) {
      upperBound = siloneApex;
    }

    const match = findClosestShapeIndex(shape, [s.lat, s.lon], prevIdx, upperBound);
    s.shape_index = match.idx;
    s.lat = shape[match.idx][0];
    s.lon = shape[match.idx][1];
    prevIdx = match.idx;

    if (match.dist > 30) {
      console.warn(`[WARN Dir ${dirId}] Fermata ${sid} (${s.stop_name}) distante ${match.dist.toFixed(1)}m dalla linea`);
    }
  }
}

async function main() {
  console.log('=== PATCH GEOMETRIA CAMPUS / QUASIMODO / VIALE EUROPA ===');
  const linea6 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  console.log('[1/4] Download nodi e strade reali OSM (zona Calvino - Quasimodo - Silone - Europa)...');
  const bboxXml = await fetchText('https://api.openstreetmap.org/api/0.6/map?bbox=12.233,44.142,12.244,44.149');
  const { nodeMap, wayNodesMap } = parseOsmBbox(bboxXml);
  console.log(`      Caricati ${nodeMap.size} nodi e ${wayNodesMap.size} strade da OSM.`);

  // Segmento stradale reale Dir 0: Ex Zuccherificio (#6021) -> Europa (#12681)
  // 1) Via Italo Calvino est: 6747244466 (#6021) -> 246646799 (incrocio Quasimodo)
  // 2) Via Salvatore Quasimodo salita NW: 246646799 -> 6754124414 (#6721) -> 246646800 -> 246646801
  // 3) Rotonda Ignazio Silone antioraria: 246646801 -> 844157591 -> 246646061 -> 246646800
  // 4) Via Salvatore Quasimodo discesa SE oltre Via Calvino fino a Viale Europa: 246646800 -> 6754124414 -> 246646799 -> 248885601
  // 5) Viale Europa svolta a sinistra (NE) fino a Europa (#12681): 248885601 -> 244666549 -> Rotonda Panathlon sud -> 249586990 -> 3493431572 (#12681)
  const dir0CampusCoords = concatNodeSegmentsToCoords([
    sliceWayNodes(wayNodesMap, '718496901', '6747244466', '246646799'),
    sliceWayNodes(wayNodesMap, '23063960', '246646799', '6754124414'),
    sliceWayNodes(wayNodesMap, '719461432', '6754124414', '246646800'),
    sliceWayNodes(wayNodesMap, '70792275', '246646800', '246646801'),
    sliceWayNodes(wayNodesMap, '719461754', '246646801', '844157591'),
    sliceWayNodes(wayNodesMap, '22908829', '844157591', '246646061'),
    sliceWayNodes(wayNodesMap, '23775241', '246646061', '246646800'),
    sliceWayNodes(wayNodesMap, '719461432', '246646800', '6754124414'),
    sliceWayNodes(wayNodesMap, '23063960', '6754124414', '246646799'),
    sliceWayNodes(wayNodesMap, '719461433', '246646799', '248885601'),
    sliceWayNodes(wayNodesMap, '24064921', '248885601', '244666549'),
    sliceWayNodes(wayNodesMap, '70792265', '244666549', '261065486'),
    sliceWayNodes(wayNodesMap, '847463932', '261065486', '261065481'),
    sliceWayNodes(wayNodesMap, '70792325', '261065481', '844157651'),
    sliceWayNodes(wayNodesMap, '847463931', '844157651', '249586990'),
    sliceWayNodes(wayNodesMap, '517767222', '249586990', '3493431572')
  ], nodeMap);

  // Segmento stradale reale Dir 1: Europa (#12682) -> Ex Zuccherificio (#6022)
  // 1) Viale Europa SO: 249586994 (#12682) -> 249586990 -> Rotonda Panathlon nord (antioraria) -> 244666549 -> 248885601 (incrocio Quasimodo)
  // 2) Via Salvatore Quasimodo salita NW: 248885601 -> 246646799 -> 6754124414 (#6721) -> 246646800 -> 246646801
  // 3) Rotonda Ignazio Silone antioraria: 246646801 -> 844157591 -> 246646061 -> 246646800
  // 4) Via Salvatore Quasimodo discesa SE fino a Via Calvino: 246646800 -> 6754124414 -> 6555696950 (#6722) -> 246646799
  // 5) Via Italo Calvino ovest fino a Ex Zuccherificio (#6022): 246646799 -> 13784481346 (#6022)
  const dir1CampusCoords = concatNodeSegmentsToCoords([
    sliceWayNodes(wayNodesMap, '517767222', '249586994', '249586990'),
    sliceWayNodes(wayNodesMap, '847463931', '249586990', '844157651'),
    sliceWayNodes(wayNodesMap, '70792321', '844157651', '844157545'),
    sliceWayNodes(wayNodesMap, '24064920', '844157545', '261065484'),
    sliceWayNodes(wayNodesMap, '24064922', '261065484', '244666549'),
    sliceWayNodes(wayNodesMap, '24064921', '244666549', '248885601'),
    sliceWayNodes(wayNodesMap, '719461433', '248885601', '246646799'),
    sliceWayNodes(wayNodesMap, '23063960', '246646799', '6754124414'),
    sliceWayNodes(wayNodesMap, '719461432', '6754124414', '246646800'),
    sliceWayNodes(wayNodesMap, '70792275', '246646800', '246646801'),
    sliceWayNodes(wayNodesMap, '719461754', '246646801', '844157591'),
    sliceWayNodes(wayNodesMap, '22908829', '844157591', '246646061'),
    sliceWayNodes(wayNodesMap, '23775241', '246646061', '246646800'),
    sliceWayNodes(wayNodesMap, '719461432', '246646800', '6754124414'),
    sliceWayNodes(wayNodesMap, '23063960', '6754124414', '246646799'),
    sliceWayNodes(wayNodesMap, '718496901', '246646799', '13784481346')
  ], nodeMap);

  // Patch shape_dir_0 tra #6021 e #12681
  console.log('[2/4] Sostituzione tratto Dir 0 tra Ex Zuccherificio (#6021) ed Europa (#12681)...');
  const oldShape0 = linea6.shape_dir_0;
  const start0 = findClosestShapeIndex(oldShape0, nodeMap.get('6747244466')).idx;
  const end0 = findClosestShapeIndex(oldShape0, nodeMap.get('3493431572'), start0).idx;
  const newShape0 = [
    ...oldShape0.slice(0, start0),
    ...dir0CampusCoords,
    ...oldShape0.slice(end0 + 1)
  ];
  console.log(`      Dir 0: sostituiti vertici [${start0}..${end0}] (${end0 - start0 + 1} pt -> ${dir0CampusCoords.length} pt). Totale: ${newShape0.length} pt.`);

  // Patch shape_dir_1 tra #12682 e #6022
  console.log('[3/4] Pulizia tratto Dir 1 tra Europa (#12682) ed Ex Zuccherificio (#6022)...');
  const oldShape1 = linea6.shape_dir_1;
  const start1 = findClosestShapeIndex(oldShape1, nodeMap.get('249586994')).idx;
  const end1 = findClosestShapeIndex(oldShape1, nodeMap.get('13784481346'), start1).idx;
  const newShape1 = [
    ...oldShape1.slice(0, start1),
    ...dir1CampusCoords,
    ...oldShape1.slice(end1 + 1)
  ];
  console.log(`      Dir 1: sostituiti vertici [${start1}..${end1}] (${end1 - start1 + 1} pt -> ${dir1CampusCoords.length} pt). Totale: ${newShape1.length} pt.`);

  // Ricalcola indici monotoni e sincronizza tutte le copie della shape
  console.log('[4/4] Ricalcolo shape_index strettamente monotoni e salvataggio data/linea6.json...');
  linea6.shape_dir_0 = newShape0;
  linea6.shape_dir_1 = newShape1;
  linea6.routes_by_direction['0'].shape = newShape0;
  linea6.routes_by_direction['1'].shape = newShape1;

  recomputeMonotonicStopIndices(linea6.routes_by_direction['0'].stops, newShape0, '0');
  recomputeMonotonicStopIndices(linea6.routes_by_direction['1'].stops, newShape1, '1');

  // Verifica rigorosa monotonicità ed assenza di coordinate di Via Umberto Saba (lon >= 12.2388 && lat >= 44.1445 && lat <= 44.1476)
  for (const dirId of ['0', '1']) {
    const stops = linea6.routes_by_direction[dirId].stops;
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].shape_index < stops[i - 1].shape_index) {
        throw new Error(`Monotonicità violata Dir ${dirId}: stop ${stops[i].stop_id} (${stops[i].shape_index}) < prev (${stops[i - 1].shape_index})`);
      }
    }
    const shape = linea6['shape_dir_' + dirId];
    const sabaPts = shape.filter(([lat, lon]) => lat > 44.1446 && lat < 44.1476 && lon > 12.2363 && lon < 12.2393);
    console.log(`      Dir ${dirId}: monotonicità OK (${stops.length} fermate), punti su Via Saba/Università = ${sabaPts.length}`);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(linea6, null, 2), 'utf8');
  console.log('[SUCCESSO] data/linea6.json aggiornato correttamente!');
}

main().catch(err => {
  console.error('[ERRORE]', err);
  process.exit(1);
});
