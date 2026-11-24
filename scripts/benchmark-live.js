const http = require('http');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsedMs = Date.now() - start;
        let json;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          elapsedMs,
          json
        });
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('=== TEST 1: Cold start to /api/linea6/live ===');
  const cold = await fetchUrl('http://localhost:3000/api/linea6/live');
  console.log(`Status: ${cold.statusCode}`);
  console.log(`Cache-Control: ${cold.headers['cache-control']}`);
  console.log(`Cold start response time: ${cold.elapsedMs}ms`);
  console.log(`Buses count: ${cold.json?.buses?.length ?? 0}`);
  if (cold.json?.buses?.length > 0) {
    cold.json.buses.forEach(b => {
      console.log(` - Bus #${b.vehicle_id || b.id}: lat=${b.lat}, lon=${b.lon}, status=${b.status_text || b.status}, dir=${b.direction_id}`);
    });
  }

  if (cold.elapsedMs > 4000) {
    console.warn(`ATTENZIONE: Cold start ${cold.elapsedMs}ms > 4000ms`);
  } else {
    console.log(`V Cold start eccellente (< 4000ms): ${cold.elapsedMs}ms`);
  }

  console.log('\n=== TEST 2: Attesa 5 secondi per verificare progressione e cache-control ===');
  await new Promise(r => setTimeout(r, 5200));

  const second = await fetchUrl('http://localhost:3000/api/linea6/live');
  console.log(`Status: ${second.statusCode}`);
  console.log(`Cache-Control: ${second.headers['cache-control']}`);
  console.log(`Second response time: ${second.elapsedMs}ms`);
  console.log(`Buses count: ${second.json?.buses?.length ?? 0}`);

  if (second.headers['cache-control']?.includes('no-store')) {
    console.log('V Header Cache-Control: no-store presente e corretto');
  } else {
    console.error('X Manca no-store in Cache-Control:', second.headers['cache-control']);
  }

  if (cold.json?.buses?.length > 0 && second.json?.buses?.length > 0) {
    const b1 = cold.json.buses[0];
    const b2 = second.json.buses.find(b => b.id === b1.id);
    if (b2) {
      console.log(`Bus #${b1.vehicle_id || b1.id}:`);
      console.log(`  Prima: lat=${b1.lat}, lon=${b1.lon}`);
      console.log(`  Dopo:  lat=${b2.lat}, lon=${b2.lon}`);
      const moved = (b1.lat !== b2.lat || b1.lon !== b2.lon);
      console.log(`  Movimento rilevato: ${moved ? 'SI (progressione fluida calcolata)' : 'NO (fermo al capolinea o stessa fermata)'}`);
    }
  }

  console.log('\n=== TEST 3: Verifica /api/linea6/arrivals ===');
  const arr = await fetchUrl('http://localhost:3000/api/linea6/arrivals?stop_id=6721&direction=0');
  console.log(`Status: ${arr.statusCode}`);
  console.log(`Cache-Control: ${arr.headers['cache-control']}`);
  console.log(`Arrivals response time: ${arr.elapsedMs}ms`);
  console.log(`Arrivals count: ${arr.json?.arrivals?.length ?? 0}`);
  if (arr.json?.arrivals?.length > 0) {
    console.log(`Prossimo arrivo: ${arr.json.arrivals[0].scheduled_time} (live: ${arr.json.arrivals[0].live_time}), eta=${arr.json.arrivals[0].eta_minutes}min`);
  }
}

run().catch(console.error);
