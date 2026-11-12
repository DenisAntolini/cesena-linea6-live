const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getLiveFeed, getStopArrivals, getPassengerArrivals, generateSimulatorBuses } = require('./services/liveTracker');
const { extractFromGtfs, FALLBACK_LINEA6 } = require('./scripts/extract-linea6');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_INTERVAL_SEC = 30;
const CACHE_INTERVAL_MS = CACHE_INTERVAL_SEC * 1000;
const DATA_FILE = path.join(process.cwd(), 'data', 'linea6.json');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Middleware
app.use(cors());
app.use(express.json());

// Se presente la cartella public, servi i file statici
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// Logger sintetico delle richieste
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Cache in memoria con TTL 30 secondi
let liveCache = {
  updated_at: null,
  last_updated_ms: 0,
  source: 'initializing',
  buses: []
};

/**
 * Carica i dati statici da data/linea6.json.
 * Se il file manca, lo genera automaticamente con il modulo di estrazione.
 */
function getStaticData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log('data/linea6.json non trovato: estrazione automatica...');
      return extractFromGtfs();
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Errore durante la lettura di data/linea6.json:', err.message);
    return FALLBACK_LINEA6;
  }
}

/**
 * Aggiorna la cache live chiamando il motore di live tracking.
 */
async function refreshLiveCache() {
  try {
    const staticData = getStaticData();
    const feed = await getLiveFeed(staticData);

    liveCache = {
      updated_at: new Date().toISOString(),
      last_updated_ms: Date.now(),
      source: feed.source,
      buses: feed.buses
    };

    console.log(
      `[Cache] Aggiornata: ${liveCache.updated_at} | Fonte: ${liveCache.source} | Autobus attivi: ${liveCache.buses.length}`
    );
  } catch (err) {
    console.error('[Cache] Errore aggiornamento live tracking:', err.message);
  }
}

// Endpoint 1: Dati statici linea 6 (fermate e tracciato polilinea)
app.get('/api/linea6/static', (req, res) => {
  try {
    const staticData = getStaticData();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(staticData);
  } catch (err) {
    res.status(500).json({ error: 'Errore nel caricamento dati statici', message: err.message });
  }
});

// Endpoint 2: Posizioni realtime autobus (compatibile sia con Serverless sia con daemon locale)
app.get('/api/linea6/live', async (req, res) => {
  const now = Date.now();
  // Se la cache in memoria è vuota o ha più di 10 secondi (tipico in Vercel Serverless), aggiorna prima di rispondere
  if (!liveCache.last_updated_ms || (now - liveCache.last_updated_ms > 10000) || !liveCache.buses || liveCache.buses.length === 0) {
    await refreshLiveCache();
  }

  const elapsedSec = liveCache.last_updated_ms
    ? Math.floor((Date.now() - liveCache.last_updated_ms) / 1000)
    : 0;

  const nextUpdateInSec = Math.max(0, 10 - elapsedSec);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
  res.status(200).json({
    updated_at: liveCache.updated_at,
    next_update_in_sec: nextUpdateInSec,
    source: liveCache.source,
    buses: liveCache.buses
  });
});

// Endpoint 3: Health check del servizio e diagnostica cache
app.get('/api/health', (req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const cacheAgeSec = liveCache.last_updated_ms
    ? Math.floor((Date.now() - liveCache.last_updated_ms) / 1000)
    : null;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    status: 'ok',
    service: 'cesena-linea6-live',
    uptime_sec: uptimeSec,
    cache_age_sec: cacheAgeSec,
    cache_ttl_sec: CACHE_INTERVAL_SEC,
    cache_source: liveCache.source,
    buses_count: liveCache.buses.length,
    timestamp: new Date().toISOString()
  });
});

// Endpoint 4: Arrivi passeggero e calcolo catchability ("Riuscirò a prenderlo?")
app.get('/api/linea6/arrivals', async (req, res) => {
  try {
    const stopId = req.query.stop_id;
    const directionId = req.query.direction;
    const userLat = req.query.user_lat;
    const userLon = req.query.user_lon;
    const walkingMinutesParam = req.query.walking_minutes;

    if (!stopId) {
      return res.status(400).json({ error: 'Parametro stop_id mancante' });
    }

    // In ambiente Serverless aggiorna se cache vuota o > 10s
    if (!liveCache.last_updated_ms || (Date.now() - liveCache.last_updated_ms > 10000)) {
      await refreshLiveCache();
    }

    const staticData = getStaticData();
    const liveBuses = (liveCache && liveCache.buses && liveCache.buses.length > 0)
      ? liveCache.buses
      : generateSimulatorBuses(staticData);

    const data = getPassengerArrivals({
      staticData,
      liveBuses,
      stopId,
      directionId,
      userLat,
      userLon,
      walkingMinutesParam
    });

    if (!data) {
      return res.status(404).json({ error: 'Fermata non trovata', stop_id: stopId });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      updated_at: liveCache.updated_at || new Date().toISOString(),
      source: liveCache.source,
      ...data
    });
  } catch (err) {
    console.error('Errore calcolo arrivi passeggero:', err);
    res.status(500).json({ error: 'Errore nel calcolo arrivi passeggero', message: err.message });
  }
});

// Alias e compatibilità retroattiva per /api/linea6/arrivals/:stopId
app.get('/api/linea6/arrivals/:stopId', (req, res) => {
  try {
    const { stopId } = req.params;
    const directionId = req.query.direction;
    const userLat = req.query.user_lat;
    const userLon = req.query.user_lon;
    const walkingMinutesParam = req.query.walking_minutes;

    const staticData = getStaticData();
    const liveBuses = (liveCache && liveCache.buses && liveCache.buses.length > 0)
      ? liveCache.buses
      : generateSimulatorBuses(staticData);

    const passengerData = getPassengerArrivals({
      staticData,
      liveBuses,
      stopId,
      directionId,
      userLat,
      userLon,
      walkingMinutesParam
    });

    if (!passengerData) {
      return res.status(404).json({ error: 'Fermata non trovata', stop_id: stopId });
    }

    const legacyArrivals = getStopArrivals(staticData, liveBuses, stopId);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      updated_at: liveCache.updated_at || new Date().toISOString(),
      source: liveCache.source,
      arrivals: legacyArrivals?.arrivals || [],
      ...passengerData
    });
  } catch (err) {
    console.error('Errore calcolo arrivi fermata:', err);
    res.status(500).json({ error: 'Errore nel calcolo arrivi', message: err.message });
  }
});

// Gestione rotte non trovate
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint API non trovato', path: req.path });
});

// Gestione errori globale
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Errore interno del server', message: err.message });
});

// Avvio server e schedulazione cache a 30 secondi
let serverInstance;

async function startServer() {
  console.log('Avvio del server cesena-linea6-live in corso...');
  
  // Primo caricamento immediato della cache prima di accettare traffico
  await refreshLiveCache();

  // Timer di background a 30 secondi
  const timerId = setInterval(refreshLiveCache, CACHE_INTERVAL_MS);
  timerId.unref();

  serverInstance = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` cesena-linea6-live Backend attivo sulla porta ${PORT}`);
    console.log(` - Static Data:  http://localhost:${PORT}/api/linea6/static`);
    console.log(` - Live Buses:   http://localhost:${PORT}/api/linea6/live`);
    console.log(` - Health Check: http://localhost:${PORT}/api/health`);
    console.log(` - Cache TTL:    ${CACHE_INTERVAL_SEC} secondi`);
    console.log(`====================================================`);
  });

  return serverInstance;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Errore fatale avvio server:', err);
    process.exit(1);
  });
}

// Esporta l'applicazione per Vercel Serverless
app.startServer = startServer;
app.refreshLiveCache = refreshLiveCache;
module.exports = app;
