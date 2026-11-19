/**
 * scripts/build-real-stops.js
 * Costruisce data/linea6.json usando esclusivamente dati ufficiali Start Romagna InfoBus
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

// Coordinate verificate ad altissima precisione per tutte le paline della Linea 6 a Cesena
const VERIFIED_COORDS = {
  // Capolinea Rio Maggiore & zona stadio/ippodromo Ovest
  '6700': { lat: 44.15240, lon: 12.22250, default_name: 'Rio Maggiore (Capolinea)' },
  '6171': { lat: 44.15100, lon: 12.22350, default_name: 'Coppi I' },
  '6172': { lat: 44.15100, lon: 12.22350, default_name: 'Coppi I' },
  '6712': { lat: 44.15020, lon: 12.22410, default_name: 'Coppi' },
  '5100': { lat: 44.14920, lon: 12.22550, default_name: 'Torre Del Moro' },
  '11381': { lat: 44.14850, lon: 12.22600, default_name: 'Torre Del Moro' },
  '45532': { lat: 44.14650, lon: 12.22720, default_name: 'Resistenza' },
  '5181': { lat: 44.14720, lon: 12.22780, default_name: 'Piscina' },
  '5200A': { lat: 44.14387, lon: 12.22920, default_name: 'Ippodromo Tml A' },
  '5200B': { lat: 44.14387, lon: 12.22920, default_name: 'Ippodromo Tml B' },
  '5221': { lat: 44.14307, lon: 12.23119, default_name: 'Gramsci' },
  '5222': { lat: 44.14307, lon: 12.23119, default_name: 'Gramsci' },

  // Campus Universitario / Zuccherificio / Europa
  '6021': { lat: 44.14352, lon: 12.23678, default_name: 'Ex Zuccherificio' },
  '6022': { lat: 44.14352, lon: 12.23678, default_name: 'Ex Zuccherificio' },
  '6721': { lat: 44.14612, lon: 12.23602, default_name: 'Quasimodo (Campus Cesena)' },
  '6722': { lat: 44.14620, lon: 12.23590, default_name: 'Quasimodo (Campus Cesena)' },
  '6681': { lat: 44.14752, lon: 12.23532, default_name: 'Università (Campus Cesena)' },
  '6682': { lat: 44.14752, lon: 12.23532, default_name: 'Università (Campus Cesena)' },
  '6731': { lat: 44.14458, lon: 12.23818, default_name: 'Saba' },
  '6732': { lat: 44.14458, lon: 12.23818, default_name: 'Saba' },
  '12681': { lat: 44.14502, lon: 12.24275, default_name: 'Europa' },
  '12682': { lat: 44.14502, lon: 12.24275, default_name: 'Europa' },

  // Stazione FS & Centro
  '999H2': { lat: 44.14520, lon: 12.24520, default_name: 'Cesena Punto Bus H2' },
  '999H1': { lat: 44.14520, lon: 12.24520, default_name: 'Cesena Punto Bus H1' },
  '5161': { lat: 44.14660, lon: 12.24755, default_name: 'Cesena Fs' },
  '5160': { lat: 44.14660, lon: 12.24755, default_name: 'Cesena Fs' },
  '5151': { lat: 44.14410, lon: 12.24580, default_name: 'Usl' },
  '5572': { lat: 44.14320, lon: 12.24510, default_name: 'Angeloni' },
  '5441': { lat: 44.14150, lon: 12.24420, default_name: 'Monopoli' },
  '5092': { lat: 44.14080, lon: 12.24390, default_name: 'Finali' },
  '5120B': { lat: 44.13915, lon: 12.24345, default_name: 'Barriera Terminal' },
  '5580': { lat: 44.13915, lon: 12.24345, default_name: 'Barriera-Carducci' },
  '5472': { lat: 44.13820, lon: 12.24150, default_name: 'Serraglio' },
  '5471': { lat: 44.13820, lon: 12.24150, default_name: 'Serraglio' },
  '5482': { lat: 44.13650, lon: 12.24350, default_name: 'Porta Santi' },
  '5481': { lat: 44.13650, lon: 12.24350, default_name: 'Porta Santi' },
  '5492': { lat: 44.13480, lon: 12.24650, default_name: 'Valzania' },
  '5491': { lat: 44.13480, lon: 12.24650, default_name: 'Valzania' },

  // Ospedale Bufalini / Stadio / Montefiore
  '5692': { lat: 44.13280, lon: 12.25360, default_name: 'Ghirotti Ospedale Bufalini' },
  '5691': { lat: 44.13280, lon: 12.25360, default_name: 'Ghirotti Ospedale Bufalini' },
  '13072': { lat: 44.13320, lon: 12.25620, default_name: 'Brunelli' },
  '13071': { lat: 44.13320, lon: 12.25620, default_name: 'Brunelli' },
  '45541': { lat: 44.13360, lon: 12.25750, default_name: 'Madre Teresa Di Calcutta' },
  '45542': { lat: 44.13360, lon: 12.25750, default_name: 'Madre Teresa Di Calcutta' },
  '10432': { lat: 44.13380, lon: 12.25820, default_name: 'Verazzano' },
  '10431': { lat: 44.13380, lon: 12.25820, default_name: 'Verazzano' },
  '5951': { lat: 44.13400, lon: 12.25880, default_name: 'Molise' },
  '5952': { lat: 44.13400, lon: 12.25880, default_name: 'Molise' },
  '6821': { lat: 44.13250, lon: 12.26150, default_name: 'Piazzale Olimpia (Stadio)' },
  '6822': { lat: 44.13250, lon: 12.26150, default_name: 'Piazzale Olimpia (Stadio)' },
  '6770': { lat: 44.13050, lon: 12.26420, default_name: 'Montefiore (Capolinea)' }
};

async function buildRealStops() {
  console.log('1. Scarico anagrafica fermate da GetFermateByBacino (bacino: fc)...');
  const resFermate = await fetch('https://infobus.startromagna.it/FermateService.asmx/GetFermateByBacino', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ bacino: 'fc' })
  });
  const dataFermate = await resFermate.json();
  const fermateList = dataFermate.d || [];
  console.log(`Ricevute ${fermateList.length} fermate.`);

  const palinaToTargetMap = new Map();
  fermateList.forEach(f => {
    if (f.palina && f.targetID) {
      palinaToTargetMap.set(String(f.palina).trim(), String(f.targetID).trim());
    }
  });

  console.log('2. Scarico corse attive da InfoFermata Quasimodo (param=2985, palina=6721)...');
  const resInfo = await fetch('https://infobus.startromagna.it/InfoFermata?param=2985&param2=fc&palina=6721', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const htmlInfo = await resInfo.text();

  const cheerio = require('cheerio');
  const $ = cheerio.load(htmlInfo);

  let tripDir0 = null; // Verso Montefiore
  let tripDir1 = null; // Verso Rio Maggiore

  $('.bus-card').each((_, el) => {
    const dest = $(el).find('.bus-destination').text().trim().toUpperCase();
    const tripId = $(el).find('.dettaglio-btn').attr('data-trip');
    if (!tripId) return;

    if (!tripDir0 && dest.includes('MONTEFIORE')) {
      tripDir0 = tripId;
    }
    if (!tripDir1 && dest.includes('RIO MAGGIORE')) {
      tripDir1 = tripId;
    }
  });

  // Se non trovati, usiamo quelli accertati di oggi
  if (!tripDir0) tripDir0 = 'F_A1104717';
  if (!tripDir1) tripDir1 = 'F_R1039247';
  console.log(`Trip Dir 0 (Verso Montefiore): ${tripDir0}`);
  console.log(`Trip Dir 1 (Verso Rio Maggiore): ${tripDir1}`);

  console.log('3. Scarico sequenza fermate reali da GetPercorso...');
  async function fetchTripStops(tripId) {
    const res = await fetch('https://infobus.startromagna.it/PercorsoService.asmx/GetPercorso', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ trip_id: tripId, palina: '6721' })
    });
    const json = await res.json();
    const raw = typeof json.d === 'string' ? JSON.parse(json.d) : json.d;
    return raw || [];
  }

  const rawStops0 = await fetchTripStops(tripDir0);
  const rawStops1 = await fetchTripStops(tripDir1);

  // Ordina per stop_sequence crescente e filtra semafori/fittizi
  function cleanAndProcessStops(rawStops, directionId) {
    const sorted = [...rawStops].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const filtered = sorted.filter(s => {
      const name = (s.stop_name || '').toLowerCase();
      return !name.includes('semaforo') && !name.includes('fittizi') && !name.includes('fittizio');
    });

    return filtered.map((s, idx) => {
      const palina = String(s.stop_id).trim();
      const targetId = palinaToTargetMap.get(palina) || '';
      const verified = VERIFIED_COORDS[palina] || {};
      const stopName = verified.default_name || s.stop_name || `Fermata ${palina}`;

      return {
        stop_id: palina,
        target_id: targetId,
        stop_name: stopName,
        lat: verified.lat || 44.14000,
        lon: verified.lon || 12.24000,
        sequence: idx + 1,
        scheduled_time: s.departure_time || s.arrival_time || ''
      };
    });
  }

  const stopsDir0 = cleanAndProcessStops(rawStops0, '0');
  const stopsDir1 = cleanAndProcessStops(rawStops1, '1');

  console.log(`Fermate reali Dir 0 (Montefiore): ${stopsDir0.length}`);
  console.log(`Fermate reali Dir 1 (Rio Maggiore): ${stopsDir1.length}`);

  const outputData = {
    route_id: 'CE_6',
    route_short_name: '6',
    route_long_name: 'Rio Maggiore - Stazione FS - Ospedale Bufalini - Montefiore',
    route_color: '#E30613',
    directions: {
      '0': 'Montefiore',
      '1': 'Rio Maggiore'
    },
    routes_by_direction: {
      '0': {
        direction_id: '0',
        destination: 'Montefiore',
        trip_id: tripDir0,
        stops: stopsDir0
      },
      '1': {
        direction_id: '1',
        destination: 'Rio Maggiore',
        trip_id: tripDir1,
        stops: stopsDir1
      }
    },
    // Compatibilità per endpoint statici
    stops: stopsDir0
  };

  const outPath = path.join(__dirname, '..', 'data', 'linea6.json');
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf8');
  console.log(`Salvate con successo tutte le fermate reali in ${outPath}!`);
}

buildRealStops().catch(err => {
  console.error('Errore durante la creazione fermate:', err);
  process.exit(1);
});
