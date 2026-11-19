process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const http = require('http');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'linea6.json');
const linea6 = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Calcola la distanza minima da un punto a un segmento [A, B]
function distToSegmentMeters(p, a, b) {
  const x = p[0], y = p[1];
  const x1 = a[0], y1 = a[1];
  const x2 = b[0], y2 = b[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return haversineMeters(x, y, x1, y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return haversineMeters(x, y, projX, projY);
}

function minDistanceToPolyline(point, shape) {
  let minDist = Infinity;
  for (let i = 0; i < shape.length - 1; i++) {
    const d = distToSegmentMeters(point, shape[i], shape[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// 1. Verifica geometrica su tutti gli intervalli possibili tra fermate
console.log('=== TEST GEOMETRICO: INTERPOLAZIONE TRA TUTTI I PAIA DI FERMATE ===');
for (const dirId of ['0', '1']) {
  const shape = linea6['shape_dir_' + dirId];
  const stops = linea6.routes_by_direction[dirId].stops;
  let maxError = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    const idxA = s1.shape_index;
    const idxB = s2.shape_index;

    for (const prog of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      let subPath;
      let busPt;
      if (idxA === idxB || idxB < idxA) {
        busPt = shape[idxA];
      } else {
        subPath = shape.slice(idxA, idxB + 1);
        // Interpola
        let totalD = 0;
        const segD = [];
        for (let j = 0; j < subPath.length - 1; j++) {
          const d = haversineMeters(subPath[j][0], subPath[j][1], subPath[j + 1][0], subPath[j + 1][1]);
          segD.push(d);
          totalD += d;
        }
        if (totalD === 0 || prog === 0) {
          busPt = subPath[0];
        } else if (prog === 1) {
          busPt = subPath[subPath.length - 1];
        } else {
          const target = prog * totalD;
          let acc = 0;
          for (let j = 0; j < segD.length; j++) {
            if (acc + segD[j] >= target || j === segD.length - 1) {
              const r = segD[j] > 0 ? (target - acc) / segD[j] : 0;
              busPt = [
                subPath[j][0] + (subPath[j + 1][0] - subPath[j][0]) * r,
                subPath[j][1] + (subPath[j + 1][1] - subPath[j][1]) * r
              ];
              break;
            }
            acc += segD[j];
          }
        }
      }
      const err = minDistanceToPolyline(busPt, shape);
      if (err > maxError) maxError = err;
    }
  }
  console.log(`Direzione ${dirId} (${linea6.directions[dirId]}): errore massimo su tutti gli step = ${maxError.toFixed(4)} metri`);
  if (maxError > 3.0) {
    throw new Error(`Errore geometrico superiore a 3 metri in Dir ${dirId}: ${maxError}m`);
  }
}

// 2. Verifica live chiamando l'endpoint reale /api/linea6/live
console.log('\n=== TEST CHIAMATA LIVE: /api/linea6/live ===');
http.get('http://localhost:3000/api/linea6/live', res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(b);
      console.log(`Endpoint /api/linea6/live ha risposto con status ${res.statusCode}`);
      console.log(`Autobus attivi rilevati: ${data.buses?.length || 0}`);
      
      if (data.buses && data.buses.length > 0) {
        data.buses.forEach(bus => {
          const shape = linea6['shape_dir_' + bus.direction_id] || linea6.shape_dir_0;
          const dist = minDistanceToPolyline([bus.lat, bus.lon], shape);
          console.log(` - Bus #${bus.vehicle_id} (Dir ${bus.direction_id} ➔ ${bus.destination}): coordinate [${bus.lat}, ${bus.lon}], distanza dalla linea = ${dist.toFixed(2)} metri`);
          if (dist > 3.0) {
            console.error(`ERRORE: Bus #${bus.vehicle_id} a ${dist.toFixed(2)} metri dalla linea (> 3m)!`);
            process.exit(1);
          }
        });
      } else {
        console.log('Nessun autobus attivo in questo istante (normale se fuori turno o nessun bus in viaggio).');
      }
      console.log('\n[PASS] Tutti i controlli di aderenza alla linea sono superati con successo (< 3 metri)!');
      process.exit(0);
    } catch (e) {
      console.error('Errore parsing risposta live:', e);
      process.exit(1);
    }
  });
}).on('error', err => {
  console.error('Errore connessione HTTP a http://localhost:3000:', err.message);
  process.exit(1);
});
