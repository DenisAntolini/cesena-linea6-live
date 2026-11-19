// scripts/sync-real-coords.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const https = require('https');

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

async function main() {
  console.log('=== VERIFICA ENDPOINT START ROMAGNA OPENDATA ===');
  const asmxUrl = 'https://servizi.startromagna.it/opendata/Opendata.asmx/FERMATE_FC_JSON';
  try {
    const asmxData = await fetchJsonHttps(asmxUrl);
    console.log(`[Start Romagna OpenData] Ricevute ${asmxData.length} fermate da FERMATE_FC_JSON.`);
  } catch (err) {
    console.warn(`[Start Romagna OpenData] Avviso: ${err.message}`);
  }

  console.log('\n=== ESECUZIONE ESTRAZIONE TRACCIATO DA scripts/fetch-osm-route.js ===');
  require('./fetch-osm-route');
}

main().catch(err => {
  console.error('[ERRORE FATALE]', err);
  process.exit(1);
});
