const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getRealLiveBuses, getPassengerArrivals, getRomeTimeParts } = require('./services/liveTracker');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_INTERVAL_SEC = 20;
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

// Logger sintetico delle richieste API
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

/**
 * Carica i dati statici ufficiali da data/linea6.json.
 */
function getStaticData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      throw new Error(`File ${DATA_FILE} mancante.`);
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Errore durante la lettura di data/linea6.json:', err.message);
    return { error: err.message, stops: [] };
  }
}

// Endpoint 1: Dati statici ufficiali linea 6 (fermate reali per direzione 0 e 1)
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

// Endpoint 2: Posizioni realtime 100% REALI degli autobus (Start Romagna InfoBus)
// Calcolo continuo fluido a 5s: getRealLiveBuses attinge alle cache in-memory di liveTracker (<2ms)
app.get('/api/linea6/live', async (req, res) => {
  try {
    const staticData = getStaticData();
    const buses = await getRealLiveBuses(staticData);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({
      updated_at: new Date().toISOString(),
      next_update_in_sec: 5,
      source: 'start_infobus_live',
      buses_count: buses.length,
      buses: buses
    });
  } catch (err) {
    console.error('Errore /api/linea6/live:', err);
    res.status(500).json({ error: 'Errore recupero live bus', message: err.message, buses: [] });
  }
});

// Endpoint 3: Arrivi in tempo reale alla fermata richiesta (con calcolo cammino)
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

    const staticData = getStaticData();
    const data = await getPassengerArrivals({
      staticData,
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).json({
      updated_at: new Date().toISOString(),
      source: 'start_infobus_live',
      ...data
    });
  } catch (err) {
    console.error('Errore calcolo arrivi fermata:', err);
    res.status(500).json({ error: 'Errore nel calcolo arrivi fermata', message: err.message });
  }
});

// Alias retrocompatibile per /api/linea6/arrivals/:stopId
app.get('/api/linea6/arrivals/:stopId', async (req, res) => {
  req.query.stop_id = req.params.stopId;
  return app._router.handle(req, res);
});

// Endpoint 4: Health check del servizio
app.get('/api/health', (req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const nowRome = getRomeTimeParts();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({
    status: 'ok',
    service: 'cesena-linea6-live',
    rome_time: nowRome.timeString,
    uptime_sec: uptimeSec,
    source: 'start_infobus_live',
    timestamp: new Date().toISOString()
  });
});

// Gestione rotte API non trovate
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint API non trovato', path: req.path });
});

// Gestione errori globale
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Errore interno del server', message: err.message });
});

let serverInstance;

async function startServer() {
  console.log('Avvio del server cesena-linea6-live (100% Real Start Romagna)...');
  getRealLiveBuses(getStaticData()).catch(() => {});

  serverInstance = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` cesena-linea6-live Backend attivo sulla porta ${PORT}`);
    console.log(` - Static Data:  http://localhost:${PORT}/api/linea6/static`);
    console.log(` - Live Buses:   http://localhost:${PORT}/api/linea6/live`);
    console.log(` - Arrivals:     http://localhost:${PORT}/api/linea6/arrivals?stop_id=6721`);
    console.log(` - Health Check: http://localhost:${PORT}/api/health`);
    console.log(` - Fonte dati:   Start Romagna InfoBus (ZERO SIMULATORI)`);
    console.log(`====================================================`);
  });

  return serverInstance;
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Errore fatale avvio server:', err);
    process.exit(1);
  });
}

app.startServer = startServer;
module.exports = app;
