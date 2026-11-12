/**
 * Script di sincronizzazione e aggiornamento dati GTFS Start Romagna (Bacino Forlì-Cesena).
 * Verifica la presenza dei file GTFS in data/gtfs/ e rigenera data/linea6.json.
 */

const fs = require('fs');
const path = require('path');
const { extractFromGtfs } = require('./extract-linea6');

const GTFS_DIR = path.join(__dirname, '../data/gtfs');
const OUTPUT_FILE = path.join(__dirname, '../data/linea6.json');

// URL ufficiali Open Data Start Romagna / Mobility Database per bacino FC
const START_ROMAGNA_OPENDATA_PORTAL = 'https://servizi.startromagna.it/opendata/';
const GTFS_FALLBACK_SOURCE = 'https://mobilitydatabase.org/feeds/gtfs/start-romagna-fc';

async function syncGtfs() {
  console.log('====================================================');
  console.log(' Start Romagna • GTFS Sync & Validator (Linea 6)');
  console.log('====================================================');

  const requiredFiles = ['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'shapes.txt'];
  const hasDir = fs.existsSync(GTFS_DIR);
  let availableFiles = [];

  if (hasDir) {
    availableFiles = requiredFiles.filter((f) => fs.existsSync(path.join(GTFS_DIR, f)));
  }

  console.log(`Verifica cartella: ${GTFS_DIR}`);
  console.log(`File GTFS presenti: ${availableFiles.length} / ${requiredFiles.length}`);

  if (availableFiles.length < requiredFiles.length) {
    console.log('--- NOTA INFORMATIVA OPEN DATA ---');
    console.log(`Per integrare l\'archivio statico grezzo completo di Start Romagna:`);
    console.log(`1. Scarica il file GTFS zippato da: ${START_ROMAGNA_OPENDATA_PORTAL}`);
    console.log(`2. Estrai i file (${requiredFiles.join(', ')}) nella cartella data/gtfs/`);
    console.log('Procedo con la generazione/rigenerazione ad alta precisione di data/linea6.json...');
  } else {
    console.log('Tutti i file GTFS sono presenti. Esecuzione estrazione integrale...');
  }

  try {
    const result = extractFromGtfs();
    console.log('Sincronizzazione completata con successo!');
    console.log(`Destinazione: ${OUTPUT_FILE}`);
    console.log(`Fermate estratte: ${result.stops?.length || 0}`);
    console.log(`Coordinate polilinea: ${result.shape?.length || 0}`);
  } catch (err) {
    console.error('Errore durante la sincronizzazione GTFS:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  syncGtfs();
}

module.exports = { syncGtfs };
