# MEGA-PROMPT & CODEBASE BUNDLE: CESENA LINEA 6 LIVE
> **Istruzioni per l'utente**: Copia l'intero contenuto di questo file e incollalo direttamente nella chat di **Google Gemini** (Gemini Advanced, Gemini 2.0 Flash o Google AI Studio).
> Gemini ha una finestra di contesto fino a 1-2 Milioni di token, quindi leggerà tutto il codice in blocco con estrema facilità.

---

## 🤖 PROMPT DI SISTEMA / PERSONA PER GEMINI
```text
Agisci come Principal Transit Architect & Senior Staff Full-Stack Engineer (Node.js, Express, Serverless, Leaflet.js, PWA, GTFS/Transit Geodata).

Stai lavorando sul progetto "Cesena Linea 6 Live" (Start Romagna), un'applicazione web moderna ad alta precisione per il monitoraggio in tempo reale degli autobus urbani della Linea 6 di Cesena (Rio Maggiore - Stazione FS - Campus Universitario - Ospedale Bufalini - Montefiore).

Il tuo obiettivo è analizzare l'intero codice sorgente fornito, individuare margini di miglioramento, ottimizzazioni di performance, nuove funzionalità ad alto impatto per gli utenti (studenti, pendolari, cittadini) e proporre codice pronto all'uso (drop-in replacement).
```

---

## 📌 PANORAMICA DEL PROGETTO & ARCHITETTURA ATTUALE

1. **Stack Tecnologico**:
   - **Frontend**: HTML5, Tailwind CSS, Leaflet 1.9.4, Lucide/Heroicons SVG.
   - **Backend**: Node.js, Express 5, compatibile sia per esecuzione locale sia per **Vercel Serverless** (`api/index.js` + `vercel.json`).
   - **PWA & Mobile**: Meta tag Apple Mobile Web App per iOS Safari a tutto schermo, `manifest.json` con tema Start Romagna (`#E30613`), Service Worker.
   - **Transit Engine**:
     * Motore grafico a 60 FPS in `requestAnimationFrame`.
     * **GPS Libero 2D (Dead Reckoning)**: gli autobus si muovono liberamente su coordinate geografiche reali (`lat`, `lon`, `bearing`) senza forzature su polilinee rigide, ideale per gestire cantieri e deviazioni stradali a Cesena.
     * **Calcolo ETA geodetico intelligente**: formula di Haversine con fattore urbano 1.28x e velocità commerciale 6.1 m/s (22 km/h).
     * **Smart Commuting**: chip rapidi per pendolari (Campus ➔ FS, FS ➔ Campus), percorsi pedonali OSM, indicatore "Fai in tempo a piedi" e allarme acustico "Esci ora".
     * **Edge Caching**: header HTTP `Cache-Control: public, s-maxage=10, stale-while-revalidate=20` per Vercel Edge CDN.

2. **Repository GitHub Ufficiale**:
   - https://github.com/DenisAntolini/cesena-linea6-live

---

## 🎯 MISSIONI CONSIGLIATE DA ASSEGNARE A GEMINI

Puoi selezionare uno dei seguenti prompt in fondo alla richiesta per indirizzare Gemini su una specifica implementazione:

- **OPZIONE A - Web Push Notifications & Sveglia in Background**:
  *Implementa notifiche push vere tramite Service Worker e Push API (oppure Local Notification API) che avvisano l'utente anche a schermo spento quando mancano 3 minuti all'arrivo del bus alla sua fermata preferita.*

- **OPZIONE B - Dark Mode Automatica & Risparmio Batteria OLED**:
  *Aggiungi supporto completo a Tailwind Dark Mode (con selettore manuale o `prefers-color-scheme`), ottimizzando i consumi dello schermo OLED su smartphone e applicando tile scure Leaflet (CartoDB Dark Matter).*

- **OPZIONE C - Integrazione GTFS-RT Reale Start Romagna & Webhook**:
  *Collega o predisponi l'ingestione diretta del feed GTFS-RT (VehiclePositions / TripUpdates / Alerts di Start Romagna o Open Data Emilia-Romagna) con fallback dinamico su simulatore quando i bus non sono in servizio.*

- **OPZIONE D - Modalità Navigazione Pedonale Passo-Passo (Turn-by-Turn)**:
  *Aggiungi navigazione guidata per raggiungere a piedi la fermata da qualsiasi punto di Cesena con bussola giroscopica e indicazioni sui metri rimanenti.*

- **OPZIONE E - Ottimizzazione Offline PWA & Service Worker Avanzato**:
  *Rafforza `public/sw.js` con caching delle tile di Cesena e delle API per permettere all'app di avviarsi istantaneamente anche con connessione debole o assente.*

---

## 📂 STRUTTURA DEI FILE CHIAVE

```
cesena-linea6-live/
├── api/
│   └── index.js             # Entrypoint Vercel Serverless
├── public/
│   ├── index.html           # Frontend SPA (Mappa Leaflet, Motore 60 FPS, UI Transit)
│   ├── manifest.json        # Configurazione PWA iOS/Android
│   ├── sw.js                # Service Worker
│   └── icon.svg             # Icona Start Romagna Linea 6
├── services/
│   └── liveTracker.js       # Simulatore, interpolazione 2D, calcolo arrivi e bearing
├── server.js                # Express Server (Locale + Serverless Vercel)
├── vercel.json              # Regole di rewrite Vercel Serverless
└── package.json             # Dipendenze Node.js
```

---

## 💻 CODICE SORGENTE COMPLETO

### 1. `vercel.json`
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" }
  ]
}
```

### 2. `api/index.js`
```javascript
module.exports = require('../server.js');
```

### 3. `server.js`
```javascript
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
  // Se la cache in memoria è vuota o ha più di 15 secondi (tipico in Vercel Serverless), aggiorna prima di rispondere
  if (!liveCache.last_updated_ms || (now - liveCache.last_updated_ms > 15000) || !liveCache.buses || liveCache.buses.length === 0) {
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

    // In ambiente Serverless aggiorna se cache vuota o > 15s
    if (!liveCache.last_updated_ms || (Date.now() - liveCache.last_updated_ms > 15000) || !liveCache.buses || liveCache.buses.length === 0) {
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
app.get('/api/linea6/arrivals/:stopId', async (req, res) => {
  try {
    const { stopId } = req.params;
    const directionId = req.query.direction;
    const userLat = req.query.user_lat;
    const userLon = req.query.user_lon;
    const walkingMinutesParam = req.query.walking_minutes;

    if (!liveCache.last_updated_ms || (Date.now() - liveCache.last_updated_ms > 15000) || !liveCache.buses || liveCache.buses.length === 0) {
      await refreshLiveCache();
    }

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
```

### 4. `public/manifest.json`
```json
{
  "name": "Cesena Linea 6 Live",
  "short_name": "Linea 6",
  "description": "Tracciamento in tempo reale degli autobus della Linea 6 di Cesena (Start Romagna)",
  "start_url": "/",
  "id": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#ffffff",
  "theme_color": "#E30613",
  "lang": "it-IT",
  "categories": ["transportation", "navigation", "utilities"],
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "192x192 512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

### 5. `package.json`
```json
{
  "name": "cesena-linea6-live",
  "version": "1.0.0",
  "description": "",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "sync-gtfs": "node scripts/sync-gtfs.js",
    "extract": "node scripts/extract-linea6.js",
    "test": "node scripts/sync-gtfs.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "@ngrok/ngrok": "^1.7.0",
    "cloudflared": "^0.7.3",
    "cors": "^2.8.6",
    "csv-parse": "^7.0.3",
    "express": "^5.3.0",
    "localtunnel": "^2.0.2",
    "tunnelmole": "^2.4.0"
  }
}
```

### 6. `services/liveTracker.js`
```javascript
const path = require('path');
const fs = require('fs');

/**
 * Calcola l'angolo di direzione (bearing / azimut) in gradi tra due coordinate GPS.
 * 0° = Nord, 90° = Est, 180° = Sud, 270° = Ovest.
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  const bearing = (toDeg(theta) + 360) % 360;
  return Math.round(bearing * 10) / 10;
}

/**
 * Calcola la distanza tra due punti in chilometri (formula di Haversine).
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Interpola posizione e direzione lungo una polilinea stradale (segment_path).
 * In questo modo l'autobus segue fedelmente ogni curva, ponte e rotonda di Cesena.
 */
function interpolateAlongPath(points, progress) {
  if (!points || points.length === 0) return null;
  if (points.length === 1 || progress <= 0) {
    const bearing = points.length > 1
      ? calculateBearing(points[0][0], points[0][1], points[1][0], points[1][1])
      : 0;
    return { lat: points[0][0], lon: points[0][1], bearing };
  }
  if (progress >= 1) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2] || points[0];
    const bearing = calculateBearing(prev[0], prev[1], last[0], last[1]);
    return { lat: last[0], lon: last[1], bearing };
  }

  // Calcolo distanze cumulative tra tutti i punti della strada
  const dists = [];
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversineDistanceKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    dists.push(d);
    totalDist += d;
  }

  if (totalDist === 0) {
    return { lat: points[0][0], lon: points[0][1], bearing: 0 };
  }

  const targetDist = progress * totalDist;
  let accumulated = 0;

  for (let i = 0; i < dists.length; i++) {
    if (accumulated + dists[i] >= targetDist || i === dists.length - 1) {
      const segProg = dists[i] > 0 ? (targetDist - accumulated) / dists[i] : 0;
      const clampedProg = Math.min(Math.max(segProg, 0), 1);
      const p1 = points[i];
      const p2 = points[i + 1];

      const lat = +(p1[0] + (p2[0] - p1[0]) * clampedProg).toFixed(6);
      const lon = +(p1[1] + (p2[1] - p1[1]) * clampedProg).toFixed(6);
      const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);

      return { lat, lon, bearing };
    }
    accumulated += dists[i];
  }

  const last = points[points.length - 1];
  return { lat: last[0], lon: last[1], bearing: 0 };
}

/**
 * Calcola la posizione simulata di un autobus lungo una sequenza di fermate
 * sincronizzata con l'orologio di sistema (Date.now()).
 */
function simulateBusPosition({ busId, busLabel, routeData, directionId, directionName, timeOffsetSec = 0 }) {
  const stops = (routeData && routeData.stops && routeData.stops.length > 0)
    ? routeData.stops
    : [];

  if (stops.length < 2) {
    return null;
  }

  const SEC_PER_SEGMENT = 90; // 1.5 minuti di percorrenza per tratta
  const DWELL_SEC = 15;        // 15 secondi di fermata / salita passeggeri
  const TERMINUS_DWELL_SEC = 120; // 2 minuti di sosta al capolinea

  const numSegments = stops.length - 1;
  const transitTotalSec = numSegments * SEC_PER_SEGMENT;
  const totalCycleSec = transitTotalSec + TERMINUS_DWELL_SEC;

  // Calcolo tempo continuo nel ciclo corrente
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const cycleClock = ((nowSec + timeOffsetSec) % totalCycleSec + totalCycleSec) % totalCycleSec;

  let currentStop;
  let nextStop;
  let progress = 0;
  let lat = stops[0].lat;
  let lon = stops[0].lon;
  let bearing = 0;
  let speedKmh = 0;
  let status = "IN_TRANSIT_TO";

  if (cycleClock >= transitTotalSec) {
    // Il bus è in sosta al capolinea di arrivo
    const lastIdx = stops.length - 1;
    currentStop = stops[lastIdx];
    nextStop = null;
    lat = currentStop.lat;
    lon = currentStop.lon;
    progress = 1.0;
    speedKmh = 0.0;
    status = "AT_TERMINUS";
    const prevStop = stops[lastIdx - 1];
    bearing = calculateBearing(prevStop.lat, prevStop.lon, currentStop.lat, currentStop.lon);
  } else {
    // Il bus è su un segmento tra stop A e stop B
    const segmentIndex = Math.min(Math.floor(cycleClock / SEC_PER_SEGMENT), numSegments - 1);
    const timeInSegment = cycleClock % SEC_PER_SEGMENT;
    const stopA = stops[segmentIndex];
    const stopB = stops[segmentIndex + 1];

    currentStop = stopA;
    nextStop = stopB;

    if (timeInSegment < DWELL_SEC) {
      // Fermo alla palina per discesa/salita passeggeri
      progress = 0.0;
      lat = stopA.lat;
      lon = stopA.lon;
      speedKmh = 0.0;
      status = "STOPPED_AT";
      bearing = calculateBearing(stopA.lat, stopA.lon, stopB.lat, stopB.lon);
    } else {
      // In movimento verso la fermata successiva lungo il tracciato stradale reale (segment_path)
      const movingTime = timeInSegment - DWELL_SEC;
      const movingWindow = SEC_PER_SEGMENT - DWELL_SEC;
      const rawProgress = Math.min(Math.max(movingTime / movingWindow, 0), 1);
      progress = Math.round(rawProgress * 100) / 100;

      const pathPoints = (stopA.segment_coords && stopA.segment_coords.length > 1)
        ? stopA.segment_coords
        : (stopA.segment_path && stopA.segment_path.length > 1)
          ? stopA.segment_path
          : [[stopA.lat, stopA.lon], [stopB.lat, stopB.lon]];

      const interpolated = interpolateAlongPath(pathPoints, rawProgress);
      lat = interpolated.lat;
      lon = interpolated.lon;
      bearing = interpolated.bearing;

      const baseSpeed = 24.0 + Math.sin(timeInSegment / 8) * 5.0;
      speedKmh = Math.round(baseSpeed * 10) / 10;
      status = "IN_TRANSIT_TO";
    }
  }

  // Ritardo realistico calibrato sul tempo di sistema (+0..+3 min)
  const delayMinutes = Math.max(0, Math.floor(1 + Math.sin((nowSec + timeOffsetSec) / 180) * 1.8));

  return {
    id: busId,
    vehicle_label: busLabel,
    route_id: "CE_6",
    route_short_name: "6",
    direction_id: directionId,
    direction_name: directionName,
    destination: directionName,
    lat,
    lon,
    bearing,
    speed_kmh: speedKmh,
    current_stop: {
      stop_id: currentStop.stop_id,
      stop_code: currentStop.stop_code,
      stop_name: currentStop.stop_name,
      sequence: currentStop.sequence,
      lat: currentStop.lat,
      lon: currentStop.lon
    },
    next_stop: nextStop ? {
      stop_id: nextStop.stop_id,
      stop_code: nextStop.stop_code,
      stop_name: nextStop.stop_name,
      sequence: nextStop.sequence,
      lat: nextStop.lat,
      lon: nextStop.lon
    } : null,
    progress,
    delay_minutes: delayMinutes,
    status,
    timestamp: new Date().toISOString()
  };
}

/**
 * Tenta il recupero posizioni realtime da InfoBus / Start Romagna.
 * Se l'endpoint non risponde entro 4 secondi o va in errore, solleva un'eccezione.
 */
async function fetchRealtimeInfoBus() {
  const timeoutMs = 4000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Endpoint Start Romagna InfoBus / GTFS-RT proxy
    const targetUrl = 'https://infobus.startromagna.it/api/linee/6/posizioni';
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CesenaLinea6Live/1.0'
      }
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} da InfoBus`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.veicoli) || data.veicoli.length === 0) {
      throw new Error('Nessun veicolo realtime attivo ricevuto dal servizio');
    }

    // Mappa formato InfoBus
    return data.veicoli.map((v, i) => ({
      id: v.id || `BUS-REAL-${i + 1}`,
      vehicle_label: v.matricola || `Start Romagna ${v.id}`,
      route_id: "CE_6",
      route_short_name: "6",
      direction_id: v.direzione === 1 ? 1 : 0,
      direction_name: v.direzione === 1 ? "Rio Maggiore" : "Montefiore",
      destination: v.destinazione || (v.direzione === 1 ? "Rio Maggiore" : "Montefiore"),
      lat: parseFloat(v.lat),
      lon: parseFloat(v.lon),
      bearing: parseFloat(v.bearing || 0),
      speed_kmh: parseFloat(v.velocita || 0),
      current_stop: v.ultima_fermata ? { stop_name: v.ultima_fermata } : null,
      next_stop: v.prossima_fermata ? { stop_name: v.prossima_fermata } : null,
      progress: parseFloat(v.progress || 0),
      delay_minutes: parseInt(v.ritardo_minuti || 0, 10),
      status: v.in_fermata ? "STOPPED_AT" : "IN_TRANSIT_TO",
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Genera gli autobus tramite il Simulatore Realistico sincronizzato con Date.now().
 * Garantisce 4 autobus attivi (2 per direzione) così che ci sia sempre un veicolo
 * in avvicinamento in entrambi i sensi di marcia.
 */
function generateSimulatorBuses(staticData) {
  const dir0Data = staticData?.routes_by_direction?.["0"] || {
    destination: "Montefiore",
    stops: staticData?.stops || []
  };

  const dir1Data = staticData?.routes_by_direction?.["1"] || {
    destination: "Rio Maggiore",
    stops: [...(staticData?.stops || [])].reverse()
  };

  // Bus 1 (Dir 0 - Verso Montefiore)
  const bus1 = simulateBusPosition({
    busId: "CE-BUS-601",
    busLabel: "Start Romagna 601",
    routeData: dir0Data,
    directionId: 0,
    directionName: dir0Data.destination || "Montefiore",
    timeOffsetSec: 0
  });

  // Bus 2 (Dir 1 - Verso Rio Maggiore)
  const bus2 = simulateBusPosition({
    busId: "CE-BUS-602",
    busLabel: "Start Romagna 602",
    routeData: dir1Data,
    directionId: 1,
    directionName: dir1Data.destination || "Rio Maggiore",
    timeOffsetSec: 240 // sfasamento 4 minuti
  });

  // Bus 3 (Dir 0 - Verso Montefiore, seconda vettura cadenzata)
  const bus3 = simulateBusPosition({
    busId: "CE-BUS-603",
    busLabel: "Start Romagna 603",
    routeData: dir0Data,
    directionId: 0,
    directionName: dir0Data.destination || "Montefiore",
    timeOffsetSec: 540 // sfasamento 9 minuti
  });

  // Bus 4 (Dir 1 - Verso Rio Maggiore, seconda vettura cadenzata)
  const bus4 = simulateBusPosition({
    busId: "CE-BUS-604",
    busLabel: "Start Romagna 604",
    routeData: dir1Data,
    directionId: 1,
    directionName: dir1Data.destination || "Rio Maggiore",
    timeOffsetSec: 780 // sfasamento 13 minuti
  });

  return [bus1, bus2, bus3, bus4].filter(Boolean);
}

/**
 * Calcola le stime di arrivo in tempo reale (ETA) per una specifica fermata della Linea 6.
 * Restituisce i dettagli della fermata e la lista dei prossimi arrivi ordinati cronologicamente.
 * 
 * @param {Object} staticData Dati di linea6.json
 * @param {Array} liveBuses Array degli autobus attivi
 * @param {string} targetStopId stop_id o stop_code della fermata
 * @returns {Object|null}
 */
function getStopArrivals(staticData, liveBuses = [], targetStopId) {
  if (!staticData || !targetStopId) return null;

  const idQuery = String(targetStopId).trim().toLowerCase();

  const dir0Data = staticData?.routes_by_direction?.["0"] || {
    destination: "Montefiore",
    stops: staticData?.stops || []
  };

  const dir1Data = staticData?.routes_by_direction?.["1"] || {
    destination: "Rio Maggiore",
    stops: [...(staticData?.stops || [])].reverse()
  };

  // Cerca la fermata in entrambe le direzioni
  const findInStops = (stops) =>
    stops.findIndex(
      (s) =>
        String(s.stop_id).toLowerCase() === idQuery ||
        String(s.stop_code).toLowerCase() === idQuery
    );

  const idx0 = findInStops(dir0Data.stops);
  const idx1 = findInStops(dir1Data.stops);

  if (idx0 === -1 && idx1 === -1) {
    return null; // Fermata non trovata
  }

  // Prendi le informazioni anagrafiche della fermata
  const stopInfo = idx0 !== -1 ? dir0Data.stops[idx0] : dir1Data.stops[idx1];

  const directionsToProcess = [];
  if (idx0 !== -1) {
    directionsToProcess.push({
      directionId: 0,
      directionName: dir0Data.destination || "Montefiore",
      targetIndex: idx0,
      stops: dir0Data.stops
    });
  }
  if (idx1 !== -1) {
    directionsToProcess.push({
      directionId: 1,
      directionName: dir1Data.destination || "Rio Maggiore",
      targetIndex: idx1,
      stops: dir1Data.stops
    });
  }

  const arrivals = [];

  directionsToProcess.forEach(({ directionId, directionName, targetIndex, stops }) => {
    const bus = liveBuses.find((b) => Number(b.direction_id) === Number(directionId));

    if (bus) {
      let currentIdx = stops.findIndex((s) => s.stop_id === bus.current_stop?.stop_id);
      if (currentIdx === -1) {
        // Fallback: fermata più vicina alle coordinate del bus
        let minD = Infinity;
        stops.forEach((s, i) => {
          const d = haversineDistanceKm(bus.lat, bus.lon, s.lat, s.lon);
          if (d < minD) {
            minD = d;
            currentIdx = i;
          }
        });
      }

      // Caso A: L'autobus sta arrivando verso questa fermata
      if (currentIdx < targetIndex || (currentIdx === targetIndex && bus.progress < 0.1)) {
        const stopsAway = Math.max(0, targetIndex - currentIdx);

        // Calcolo distanza stradale cumulativa lungo le fermate
        let distKm = 0;
        if (targetIndex > currentIdx) {
          // Distanza residua tra bus e prossima fermata
          const nextStop = bus.next_stop || stops[currentIdx + 1];
          if (nextStop) {
            distKm += haversineDistanceKm(bus.lat, bus.lon, nextStop.lat, nextStop.lon);
          }
          for (let i = currentIdx + 1; i < targetIndex; i++) {
            distKm += haversineDistanceKm(stops[i].lat, stops[i].lon, stops[i + 1].lat, stops[i + 1].lon);
          }
        } else {
          distKm = haversineDistanceKm(bus.lat, bus.lon, stops[targetIndex].lat, stops[targetIndex].lon);
        }

        const distanceMeters = Math.round(distKm * 1000);
        // Velocità media urbana Cesena ~22 km/h + 20s per sosta intermedia
        const travelSec = (distKm / 22) * 3600;
        const dwellSec = stopsAway * 20;
        let etaSeconds = Math.max(0, Math.round(travelSec + dwellSec));

        let etaMinutes;
        let status;
        let etaFormatted;

        if (stopsAway === 0 || distanceMeters <= 80 || (bus.status === 'STOPPED_AT' && currentIdx === targetIndex)) {
          etaSeconds = 0;
          etaMinutes = 0;
          status = (bus.status === 'STOPPED_AT' && currentIdx === targetIndex) ? "IN FERMATA" : "IN ARRIVO";
          etaFormatted = status;
        } else {
          etaMinutes = Math.max(1, Math.round(etaSeconds / 60));
          if (etaMinutes <= 1) {
            status = "IN ARRIVO";
            etaFormatted = "IN ARRIVO";
          } else if (etaMinutes <= 3) {
            status = "IN AVVICINAMENTO";
            etaFormatted = `tra ${etaMinutes} min`;
          } else {
            status = "IN MARCIA";
            etaFormatted = `tra ${etaMinutes} min`;
          }
        }

        arrivals.push({
          line: "6",
          route_short_name: "6",
          direction_id: directionId,
          destination: directionName,
          vehicle_label: bus.vehicle_label || `Bus ${bus.id}`,
          bus_id: bus.id,
          eta_minutes: etaMinutes,
          eta_seconds: etaSeconds,
          eta_formatted: etaFormatted,
          stops_away: stopsAway,
          distance_meters: distanceMeters,
          status,
          is_realtime: true
        });
      } else {
        // Caso B: L'autobus ha già superato questa fermata nella corsa corrente.
        // Calcola l'arrivo della corsa successiva in base alla frequenza programmata (18 min)
        const passedStops = currentIdx - targetIndex;
        const estimatedElapsedSec = passedStops * 90;
        const headwaySec = 18 * 60; // Frequenza tipica Linea 6: 18 minuti
        const nextRunEtaSec = Math.max(480, headwaySec - estimatedElapsedSec);
        const nextRunEtaMin = Math.round(nextRunEtaSec / 60);
        const stopsAwayEst = (stops.length - 1 - currentIdx) + targetIndex + 1;

        arrivals.push({
          line: "6",
          route_short_name: "6",
          direction_id: directionId,
          destination: directionName,
          vehicle_label: "Corsa successiva",
          bus_id: null,
          eta_minutes: nextRunEtaMin,
          eta_seconds: nextRunEtaSec,
          eta_formatted: `tra ${nextRunEtaMin} min`,
          stops_away: stopsAwayEst,
          distance_meters: Math.round(stopsAwayEst * 580),
          status: "PROGRAMMATO",
          is_realtime: false
        });
      }
    } else {
      // Nessun autobus live trovato per questa direzione: stima corsa programmata
      arrivals.push({
        line: "6",
        route_short_name: "6",
        direction_id: directionId,
        destination: directionName,
        vehicle_label: "Corsa di linea",
        bus_id: null,
        eta_minutes: 15,
        eta_seconds: 900,
        eta_formatted: "tra 15 min",
        stops_away: 8,
        distance_meters: 4200,
        status: "PROGRAMMATO",
        is_realtime: false
      });
    }
  });

  // Ordina arrivi per eta_seconds crescente
  arrivals.sort((a, b) => a.eta_seconds - b.eta_seconds);

  return {
    stop: {
      stop_id: stopInfo.stop_id,
      stop_code: stopInfo.stop_code,
      stop_name: stopInfo.stop_name,
      lat: stopInfo.lat,
      lon: stopInfo.lon
    },
    arrivals
  };
}

/**
 * Restituisce i feed live completi:
 * tenta prima la sorgente remota InfoBus (timeout 4s), con fallback automatico
 * sul simulatore deterministico sincronizzato con l'orologio di sistema.
 * 
 * @param {Object} staticData Contenuto di linea6.json
 * @returns {Promise<{ source: string, buses: Array }>}
 */
async function getLiveFeed(staticData) {
  try {
    const liveBuses = await fetchRealtimeInfoBus();
    return {
      source: "infobus_realtime",
      buses: liveBuses
    };
  } catch (err) {
    // Fallback automatico trasparente
    const simulatedBuses = generateSimulatorBuses(staticData);
    return {
      source: "simulator_fallback",
      buses: simulatedBuses
    };
  }
}

/**
 * Funzione principale richiesta dalla specifica:
 * restituisce un array di autobus attivi sulla Linea 6.
 * All'array è inoltre allegata la proprietà `.source` per comodità dei consumatori.
 * 
 * @param {Object} staticData
 * @returns {Promise<Array>}
 */
async function getLiveBuses(staticData) {
  const feed = await getLiveFeed(staticData);
  const buses = feed.buses;
  buses.source = feed.source;
  return buses;
}

/**
 * Calcola i prossimi 4 autobus per la fermata selezionata con stima di cammino ("walking_info")
 * e valutazione immediata di fattibilità per il passeggero ("catchability": EASY, HURRY, MISSED).
 */
function getPassengerArrivals({
  staticData,
  liveBuses = [],
  stopId,
  directionId = 0,
  userLat = null,
  userLon = null,
  walkingMinutesParam = null
}) {
  if (!staticData || !stopId) return null;

  const idQuery = String(stopId).trim().toLowerCase();
  let dir = Number(directionId) === 1 ? 1 : 0;

  let dirData = staticData.routes_by_direction?.[String(dir)];
  let dirStops = dirData?.stops || [];

  // Trova la fermata nella direzione scelta
  let stopIdx = dirStops.findIndex(
    (s) =>
      String(s.stop_id).toLowerCase() === idQuery ||
      String(s.stop_code).toLowerCase() === idQuery
  );

  // Se non trovata nella direzione richiesta, controlla l'altra direzione
  if (stopIdx === -1) {
    const altDir = dir === 0 ? 1 : 0;
    const altData = staticData.routes_by_direction?.[String(altDir)];
    const altStops = altData?.stops || [];
    const altIdx = altStops.findIndex(
      (s) =>
        String(s.stop_id).toLowerCase() === idQuery ||
        String(s.stop_code).toLowerCase() === idQuery
    );
    if (altIdx !== -1) {
      dir = altDir;
      dirData = altData;
      dirStops = altStops;
      stopIdx = altIdx;
    } else {
      return null; // Fermata inesistente
    }
  }

  const stop = dirStops[stopIdx];
  const destination = dirData.destination || (dir === 0 ? "Montefiore" : "Rio Maggiore");

  // Calcolo tempo di cammino a piedi (4.8 km/h = 80 metri/minuto)
  let walkingDistanceMeters = null;
  let isGpsDerived = false;
  let walkingMinutes = 2; // Default passeggero se non specificato

  if (userLat != null && userLon != null && !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLon))) {
    const uLat = parseFloat(userLat);
    const uLon = parseFloat(userLon);
    walkingDistanceMeters = Math.round(haversineDistanceKm(uLat, uLon, stop.lat, stop.lon) * 1000);
    walkingMinutes = Math.max(0, Math.round(walkingDistanceMeters / 80));
    isGpsDerived = true;
  }

  if (walkingMinutesParam != null && !isNaN(parseInt(walkingMinutesParam, 10))) {
    walkingMinutes = Math.max(0, parseInt(walkingMinutesParam, 10));
    isGpsDerived = false;
  }

  // Cerca tra tutti gli autobus live attivi in questa direzione
  const dirBuses = (liveBuses || []).filter((b) => Number(b.direction_id) === Number(dir));
  let bestLiveBus = null;
  let bestStopsAway = Infinity;
  let bestCurrentBusIdx = -1;

  dirBuses.forEach((b) => {
    let busIdx = dirStops.findIndex((s) => s.stop_id === b.current_stop?.stop_id);
    if (busIdx === -1) {
      let minD = Infinity;
      dirStops.forEach((s, i) => {
        const d = haversineDistanceKm(b.lat, b.lon, s.lat, s.lon);
        if (d < minD) {
          minD = d;
          busIdx = i;
        }
      });
    }

    // Un bus si sta avvicinando se non ha ancora superato la fermata
    const isApproaching = busIdx !== -1 && (
      busIdx < stopIdx || (busIdx === stopIdx && b.status === 'STOPPED_AT' && (b.progress || 0) < 0.2)
    );

    if (isApproaching) {
      const stopsAway = Math.max(0, stopIdx - busIdx);
      if (stopsAway < bestStopsAway) {
        bestStopsAway = stopsAway;
        bestLiveBus = b;
        bestCurrentBusIdx = busIdx;
      }
    }
  });

  // Se non c'è un bus prima di stopIdx, seleziona il bus live della flotta che completerà il giro per primo
  if (!bestLiveBus && dirBuses.length > 0) {
    // Ordina per bus più avanzato nel percorso (più vicino al capolinea di arrivo)
    let maxIdx = -1;
    let advancedBus = dirBuses[0];
    dirBuses.forEach((b) => {
      let bIdx = dirStops.findIndex((s) => s.stop_id === b.current_stop?.stop_id);
      if (bIdx > maxIdx) {
        maxIdx = bIdx;
        advancedBus = b;
      }
    });
    bestLiveBus = advancedBus;
    bestCurrentBusIdx = maxIdx !== -1 ? maxIdx : 0;
  } else if (!bestLiveBus && liveBuses.length > 0) {
    bestLiveBus = liveBuses[0];
    bestCurrentBusIdx = 0;
  }

  const liveBus = bestLiveBus;
  const currentBusIdx = bestCurrentBusIdx;
  const isLiveBusApproaching = Boolean(liveBus);

  let baseEtaMin = 5;
  const nextBuses = [];

  const nowMs = Date.now();

  if (isLiveBusApproaching) {
    // 1. Il primo autobus è SEMPRE il veicolo reale live attualmente in marcia sulla linea
    let stopsAway;
    let distanceMeters = 0;

    if (currentBusIdx <= stopIdx) {
      stopsAway = Math.max(0, stopIdx - currentBusIdx);
      if (stopIdx > currentBusIdx) {
        const nextS = liveBus.next_stop || dirStops[currentBusIdx + 1];
        if (nextS) {
          distanceMeters += Math.round(haversineDistanceKm(liveBus.lat, liveBus.lon, nextS.lat, nextS.lon) * 1000);
        }
        for (let i = currentBusIdx + 1; i < stopIdx; i++) {
          distanceMeters += (dirStops[i].distance_to_next_meters || Math.round(haversineDistanceKm(dirStops[i].lat, dirStops[i].lon, dirStops[i + 1].lat, dirStops[i + 1].lon) * 1000));
        }
      } else {
        distanceMeters = Math.round(haversineDistanceKm(liveBus.lat, liveBus.lon, stop.lat, stop.lon) * 1000);
      }
    } else {
      // Il bus è più avanti: completerà la corsa al capolinea e ripartirà
      const remainingCurrentRun = Math.max(0, (dirStops.length - 1) - currentBusIdx);
      stopsAway = remainingCurrentRun + stopIdx + 1;
      distanceMeters = stopsAway * 480;
    }

    const travelSec = (distanceMeters / (22000 / 3600));
    const dwellSec = stopsAway * 20;
    const etaSec = Math.max(0, Math.round(travelSec + dwellSec));

    let etaMin = (stopsAway === 0 || distanceMeters <= 80 || (liveBus.status === 'STOPPED_AT' && currentBusIdx === stopIdx))
      ? 0
      : Math.max(1, Math.round(etaSec / 60));

    baseEtaMin = etaMin;

    nextBuses.push({
      order: 1,
      line: "6",
      destination,
      vehicle_label: liveBus.vehicle_label || "Start Romagna 6",
      bus_id: liveBus.id,
      is_live: true,
      eta_minutes: etaMin,
      stops_away: stopsAway,
      distance_meters: distanceMeters,
      status: etaMin === 0 ? "IN FERMATA" : (etaMin <= 1 ? "IN ARRIVO" : "IN MARCIA"),
      live_location: {
        lat: liveBus.lat,
        lon: liveBus.lon,
        speed_kmh: liveBus.speed_kmh,
        bearing: liveBus.bearing
      }
    });
  } else {
    // Fallback di sicurezza estrema
    baseEtaMin = 6;
    nextBuses.push({
      order: 1,
      line: "6",
      destination,
      vehicle_label: "Start Romagna 601",
      bus_id: "CE-BUS-601",
      is_live: true,
      eta_minutes: baseEtaMin,
      stops_away: 3,
      distance_meters: 1500,
      status: "IN MARCIA",
      live_location: {
        lat: stop.lat,
        lon: stop.lon,
        speed_kmh: 24,
        bearing: 90
      }
    });
  }

  // Genera le successive 3 corse programmate a intervalli di 15 minuti (totale 4 corse)
  const FREQUENCY_MIN = 15;
  for (let k = 2; k <= 4; k++) {
    const scheduledEta = baseEtaMin + (k - 1) * FREQUENCY_MIN;
    nextBuses.push({
      order: k,
      line: "6",
      destination,
      vehicle_label: `Start Romagna 6 (${k}° corsa)`,
      bus_id: null,
      is_live: false,
      eta_minutes: scheduledEta,
      stops_away: nextBuses[0].stops_away + (k - 1) * (dirStops.length - 1),
      distance_meters: nextBuses[0].distance_meters + (k - 1) * 5200,
      status: "PROGRAMMATO",
      live_location: null
    });
  }

  // Calcolo catchability ("Riuscirò a prenderlo?") e formattazione orari per ciascun bus
  nextBuses.forEach((b) => {
    const arrivalDate = new Date(nowMs + b.eta_minutes * 60000);
    b.expected_time = arrivalDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const margin = b.eta_minutes - walkingMinutes;

    if (margin >= 2) {
      b.catchability = {
        code: "EASY",
        color: "green",
        badge: "🟢 Fai in tempo a piedi",
        title: "Fai in tempo a piedi",
        message: margin > 2
          ? `Esci tra ${margin} min (hai ${margin} min di margine)`
          : `Sei a ${walkingMinutes} min a piedi, il bus arriva tra ${b.eta_minutes} min`,
        margin_minutes: margin
      };
    } else if (margin >= 0) {
      b.catchability = {
        code: "HURRY",
        color: "yellow",
        badge: "🟡 Esci subito",
        title: "Esci subito",
        message: `Arriva tra ${b.eta_minutes} min, parti subito a passo svelto!`,
        margin_minutes: margin
      };
    } else {
      b.catchability = {
        code: "MISSED",
        color: "red",
        badge: "🔴 Troppo vicino, punta al successivo",
        title: "Troppo vicino",
        message: `Arriva tra ${b.eta_minutes} min (ti servono ${walkingMinutes} min a piedi). Prendi la corsa successiva!`,
        margin_minutes: margin
      };
    }
  });

  return {
    stop: {
      stop_id: stop.stop_id,
      stop_code: stop.stop_code,
      stop_name: stop.stop_name,
      lat: stop.lat,
      lon: stop.lon
    },
    direction: {
      direction_id: dir,
      destination
    },
    walking_info: {
      walking_minutes: walkingMinutes,
      walking_distance_meters: walkingDistanceMeters,
      speed_kmh: 4.8,
      is_gps_derived: isGpsDerived
    },
    next_buses: nextBuses
  };
}

module.exports = {
  getLiveBuses,
  getLiveFeed,
  getStopArrivals,
  getPassengerArrivals,
  calculateBearing,
  haversineDistanceKm,
  simulateBusPosition,
  generateSimulatorBuses,
  interpolateAlongPath
};
```

### 7. `public/index.html`
```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Linea 6 Cesena Live • Posizione Autobus in Tempo Reale | Start Romagna</title>
  <meta name="description" content="Mappa interattiva in tempo reale della Linea 6 di Cesena (Rio Maggiore - Campus Universitario - Stazione FS - Ospedale Bufalini - Montefiore)." />

  <!-- PWA & iOS Safari Mobile Web App -->
  <meta name="theme-color" content="#E30613" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Linea 6" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <link rel="manifest" href="/manifest.json" />

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Google Fonts: Inter / Roboto -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

  <!-- Leaflet 1.9.4 CSS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />

  <style>
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #e5e7eb;
    }

    /* Mappa Full Screen */
    #map {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
    }

    /* Filtro stile Google Maps Transit sulle tile OSM */
    .gmaps-tiles {
      filter: saturate(0.88) contrast(0.98) brightness(1.02);
    }

    /* Pannello Fluttuante Stile Google Maps */
    .gmaps-panel {
      position: fixed;
      top: 16px;
      left: 16px;
      width: 375px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
      z-index: 1000;
      border: 1px solid rgba(226, 232, 240, 0.9);
      transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @media (max-width: 640px) {
      .gmaps-panel {
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        width: 100vw;
        max-width: 100vw;
        max-height: 64vh;
        border-radius: 22px 22px 0 0;
      }
      .gmaps-panel.collapsed {
        transform: translateY(calc(100% - 86px));
      }
    }

    /* Punto Blu Utente Stile Google Maps */
    .user-blue-dot-wrapper {
      position: relative;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
    }
    .user-blue-dot-wrapper:active {
      cursor: grabbing;
    }
    .user-blue-halo {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 9999px;
      background: rgba(26, 115, 232, 0.22);
      animation: userPulse 2.2s infinite ease-out;
      pointer-events: none;
    }
    .user-blue-core {
      position: relative;
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #1A73E8;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
      z-index: 2;
    }
    @keyframes userPulse {
      0% { transform: scale(0.5); opacity: 0.9; }
      100% { transform: scale(1.65); opacity: 0; }
    }

    /* Pin Fermata Selezionata dall'Utente */
    .selected-stop-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .selected-stop-label {
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
      border: 1.5px solid #ffffff;
      margin-bottom: 4px;
    }
    .selected-stop-dot {
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #E30613;
      border: 3px solid #ffffff;
      box-shadow: 0 2px 8px rgba(227, 6, 19, 0.5);
    }

    /* Marker Autobus Live Stile Google Maps */
    .bus-live-wrapper {
      position: relative;
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bus-radar-wave {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 9999px;
      background: rgba(22, 163, 74, 0.28);
      animation: busRadar 1.9s infinite ease-out;
      pointer-events: none;
    }
    @keyframes busRadar {
      0% { transform: scale(0.7); opacity: 0.9; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    .bus-compass-ring {
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      pointer-events: none;
      transition: transform 0.15s linear;
    }
    .bus-heading-arrow {
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 9px solid #1e293b;
      margin-top: -4px;
      filter: drop-shadow(0 1px 2px rgba(255,255,255,0.9));
    }
    .bus-circle-body {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      background: #1A73E8;
      border: 2.5px solid #ffffff;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(26, 115, 232, 0.45);
      z-index: 3;
    }
    .bus-circle-body.is-primary {
      background: #E30613;
      box-shadow: 0 4px 12px rgba(227, 6, 19, 0.55);
    }
    .bus-pill-tag {
      position: absolute;
      top: 38px;
      background: #ffffff;
      color: #0f172a;
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
      border: 1px solid #cbd5e1;
      z-index: 4;
    }

    /* Tooltip pulito al passaggio del mouse sulle fermate */
    .leaflet-tooltip.clean-stop-tooltip {
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 11.5px;
      font-weight: 600;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    }
    .leaflet-tooltip.clean-stop-tooltip::before {
      border-top-color: #0f172a;
    }
  </style>
</head>
<body>

  <!-- Mappa Full-Screen -->
  <div id="map"></div>

  <!-- Card Fluttuante Google Maps Transit -->
  <aside id="transitPanel" class="gmaps-panel p-4">
    <!-- Maniglia mobile per ridurre/espandere -->
    <div id="mobileHandle" class="sm:hidden w-full flex justify-center pb-2 cursor-pointer">
      <div class="w-10 h-1.5 bg-slate-300 rounded-full"></div>
    </div>

    <!-- Header Linea 6 Start Romagna -->
    <div class="flex items-center justify-between pb-2.5 border-b border-slate-100">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-[#E30613] text-white font-black text-xl flex items-center justify-center shadow-sm shrink-0">
          6
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-bold text-slate-900 text-base leading-tight">Linea 6 • Cesena</h1>
            <span id="liveSourceBadge" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              LIVE GPS
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">Rio Maggiore ⇄ Università ⇄ FS ⇄ Bufalini ⇄ Montefiore</p>
        </div>
      </div>
      <span id="roadGeometryStatus" class="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 shrink-0">
        Strade OSM
      </span>
    </div>

    <!-- Barra Orario Reale + Scelta Rapida Pendolare Mattina/Sera -->
    <div class="mt-2.5 flex flex-wrap items-center justify-between gap-1.5">
      <span id="scheduleBadge" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
        🕒 Calcolo fascia oraria...
      </span>
      <div class="flex items-center gap-1">
        <button id="chipMorningCommute" type="button" title="Andata Mattina: da Stazione FS verso Campus Universitario" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition">
          🌅 FS ➔ Campus
        </button>
        <button id="chipEveningCommute" type="button" title="Rientro Pomeriggio: da Campus Universitario verso Stazione FS" class="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition">
          🌇 Campus ➔ FS
        </button>
      </div>
    </div>

    <!-- Banner Fine Servizio Notturno (visibile solo tra le 20:45 e le 06:00) -->
    <div id="nightServiceBanner" class="hidden mt-2.5 p-2.5 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between gap-2">
      <div>
        <div class="font-bold">🌙 Servizio serale terminato</div>
        <div class="text-[11px] text-slate-300">Prima corsa domani mattina alle <strong>06:05</strong></div>
      </div>
      <button id="btnForceDaySim" type="button" class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-bold shrink-0 transition">
        Simula Diurno
      </button>
    </div>

    <!-- 1. Scelta Direzione e Fermata -->
    <div class="mt-2.5 space-y-2">
      <!-- Selettore Direzione -->
      <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
        <button id="btnDir0" type="button" class="py-2 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-blue-600 shadow-sm flex items-center justify-center gap-1">
          <span>➔</span> Verso Montefiore
        </button>
        <button id="btnDir1" type="button" class="py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1">
          <span>➔</span> Verso Rio Maggiore
        </button>
      </div>

      <!-- Menu Fermata + Bottone Posizione Campus/GPS -->
      <div class="flex items-center gap-1.5">
        <div class="relative flex-1">
          <select id="stopSelect" aria-label="Fermata di partenza" class="w-full appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        <button id="btnLocateCampus" type="button" title="Posizionati al Campus Universitario" class="px-2.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shrink-0 transition" aria-label="Campus Universitario">
          🎓 Campus
        </button>
        <button id="btnRealGps" type="button" title="Usa il tuo GPS reale" class="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold shrink-0 transition" aria-label="Posizione GPS">
          📍
        </button>
      </div>

      <!-- Info distanza pedonale reale + Sveglia di partenza -->
      <div id="walkBanner" class="flex items-center justify-between gap-2 text-[11px] bg-blue-50/80 text-blue-900 px-3 py-1.5 rounded-lg border border-blue-100">
        <span id="walkText" class="truncate">📍 Dal tuo punto: <strong>45m</strong> (~1 min a piedi)</span>
        <span id="walkModeBadge" class="text-[10px] text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded font-semibold shrink-0">Sentiero OSM</span>
      </div>

      <!-- Pulsante Sveglia "Esci Ora" -->
      <button id="btnToggleAlarm" type="button" class="w-full py-1.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-between transition">
        <span id="alarmBtnText">🔔 Attiva sveglia "Esci ora"</span>
        <span id="alarmStatusPill" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">OFF</span>
      </button>

      <!-- Banner Allarme Attivo quando è il momento di uscire -->
      <div id="alarmAlertBanner" class="hidden p-3 rounded-xl bg-amber-500 text-white text-xs font-bold shadow-md animate-bounce items-center justify-between gap-2">
        <span id="alarmAlertText">🚨 ESCI ORA! Il bus è in arrivo!</span>
        <button id="btnDismissAlarm" type="button" class="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-[10px] font-extrabold shrink-0">
          OK
        </button>
      </div>
    </div>

    <!-- 2. Box Principale: "Riuscirò a prenderlo?" -->
    <div id="heroArrivalBox" class="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90">
      <!-- Popolato in tempo reale da JS -->
    </div>

    <!-- 3. Passaggi Successivi -->
    <div class="mt-3 pt-2.5 border-t border-slate-100">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Passaggi successivi a questa fermata</span>
        <span id="liveClock" class="text-[11px] font-semibold text-slate-400"></span>
      </div>
      <div id="subsequentBusesList" class="space-y-1.5">
        <!-- Popolato in tempo reale da JS -->
      </div>
    </div>
  </aside>

  <!-- Pulsanti Rapidi in Basso a Destra (Stile Google Maps) -->
  <div class="fixed bottom-6 right-4 z-[900] flex flex-col gap-2">
    <button id="fabCenterUser" type="button" title="Vai alla tua posizione" class="w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition">
      <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
      </svg>
    </button>
    <button id="fabFitRoute" type="button" title="Inquadra intera Linea 6" class="w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
    </button>
  </div>

  <!-- Leaflet 1.9.4 JS -->
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>

  <script>
(() => {
      'use strict';

      /* ========================================================================
         1. FERMATE UFFICIALI LINEA 6 CESENA (Senza linee pretracciate)
         ======================================================================== */
      const STOPS_DIR_0 = [
        { stop_id: 'CE_6001', stop_code: '6001', stop_name: 'Rio Maggiore (Capolinea)', lat: 44.15240, lon: 12.22250, sequence: 1 },
        { stop_id: 'CE_6003', stop_code: '6003', stop_name: 'Torre del Moro', lat: 44.14635, lon: 12.22695, sequence: 2 },
        { stop_id: 'CE_6005', stop_code: '6005', stop_name: 'Ippodromo Gramsci', lat: 44.14368, lon: 12.23085, sequence: 3 },
        { stop_id: 'CE_6006', stop_code: '6006', stop_name: 'Ex Zuccherificio (Via Calvino)', lat: 44.14352, lon: 12.23678, sequence: 4 },
        { stop_id: 'CE_6007', stop_code: '6007', stop_name: 'Quasimodo (Via S. Quasimodo)', lat: 44.14612, lon: 12.23602, sequence: 5 },
        { stop_id: 'CE_6008', stop_code: '6008', stop_name: 'Università (Campus Cesena)', lat: 44.14752, lon: 12.23532, sequence: 6 },
        { stop_id: 'CE_6009', stop_code: '6009', stop_name: 'Saba (Via Umberto Saba)', lat: 44.14458, lon: 12.23818, sequence: 7 },
        { stop_id: 'CE_6010', stop_code: '6010', stop_name: 'Europa (Architettura / Poste)', lat: 44.14502, lon: 12.24275, sequence: 8 },
        { stop_id: 'CE_6011', stop_code: '6011', stop_name: 'Cesena Stazione FS', lat: 44.14660, lon: 12.24755, sequence: 9 },
        { stop_id: 'CE_6014', stop_code: '6014', stop_name: 'Barriera Cavour', lat: 44.13915, lon: 12.24345, sequence: 10 },
        { stop_id: 'CE_6017', stop_code: '6017', stop_name: 'Viale Mazzoni', lat: 44.13720, lon: 12.24200, sequence: 11 },
        { stop_id: 'CE_6019', stop_code: '6019', stop_name: 'Ponte Nuovo / Viale Roma', lat: 44.13480, lon: 12.24650, sequence: 12 },
        { stop_id: 'CE_6021', stop_code: '6021', stop_name: 'Ghirotti Ospedale Bufalini', lat: 44.13280, lon: 12.25360, sequence: 13 },
        { stop_id: 'CE_6023', stop_code: '6023', stop_name: 'Piazzale Olimpia (Stadio)', lat: 44.13400, lon: 12.25880, sequence: 14 },
        { stop_id: 'CE_6025', stop_code: '6025', stop_name: 'Montefiore (Capolinea)', lat: 44.13050, lon: 12.26420, sequence: 15 }
      ];

      const STOPS_DIR_1 = [...STOPS_DIR_0].reverse().map((s, idx) => ({
        ...s,
        stop_id: s.stop_id.replace('CE_60', 'CE_61'),
        sequence: idx + 1
      }));

      // Punti stradali usati solo come riferimento GPS invisibile (incluse deviazioni lavori stradali)
      const FREE_GPS_WAYPOINTS_DIR_0 = [
        [44.15240, 12.22250], [44.15020, 12.22550], [44.14635, 12.22695],
        [44.14368, 12.23085], [44.14315, 12.23485], [44.14352, 12.23678],
        [44.14612, 12.23602], [44.14752, 12.23532], [44.14630, 12.23715],
        [44.14458, 12.23818], [44.14460, 12.24085], [44.14502, 12.24275],
        [44.14660, 12.24755], [44.14320, 12.24430], [44.13915, 12.24345],
        [44.13720, 12.24200], [44.13480, 12.24650], [44.13280, 12.25360],
        [44.13400, 12.25880], [44.13050, 12.26420]
      ];

      /* ========================================================================
         2. FUNZIONI GEODESICHE (HAVERSINE & BEARING 2D LIBERO)
         ======================================================================== */
      function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = d => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      function computeBearing(lat1, lon1, lat2, lon2) {
        const toRad = d => (d * Math.PI) / 180;
        const toDeg = r => (r * 180) / Math.PI;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                  Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
      }

      function densifyGpsStream(coords, stepMeters = 20) {
        const out = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const p1 = coords[i];
          const p2 = coords[i + 1];
          const dist = haversineMeters(p1[0], p1[1], p2[0], p2[1]);
          const steps = Math.max(1, Math.ceil(dist / stepMeters));
          for (let s = 0; s < steps; s++) {
            const t = s / steps;
            out.push([
              +(p1[0] + (p2[0] - p1[0]) * t).toFixed(6),
              +(p1[1] + (p2[1] - p1[1]) * t).toFixed(6)
            ]);
          }
        }
        out.push(coords[coords.length - 1]);
        return out;
      }

      /* ========================================================================
         3. STATO DELL'APPLICAZIONE (NESSUNA LINEA PRETRACCIATA)
         ======================================================================== */
      const CAMPUS_COORDS = { lat: 44.14710, lon: 12.23550, label: 'Campus Universitario' };
      const STAZIONE_COORDS = { lat: 44.14660, lon: 12.24755, label: 'Cesena Stazione FS' };

      const state = {
        map: null,
        direction: 0,
        selectedStopId: 'CE_6008',
        userPos: { ...CAMPUS_COORDS },
        walkingMeters: 45,
        walkingMinutes: 1,
        followedBusId: null,
        forceDaySimulation: false,
        alarmEnabled: false,
        lastAlertedBusId: null,
        backendSyncActive: false,
        lastServerUpdatedAt: null,
        liveApiVehicles: { 0: [], 1: [] },
        backendLastSyncMs: 0,
        pedestrianAbortCtrl: null,
        pedestrianTimer: null,
        routes: {
          0: { stops: STOPS_DIR_0, gpsStream: densifyGpsStream(FREE_GPS_WAYPOINTS_DIR_0, 20) },
          1: { stops: STOPS_DIR_1, gpsStream: densifyGpsStream([...FREE_GPS_WAYPOINTS_DIR_0].reverse(), 20) }
        },
        layers: {
          walkLine: null,
          stopsGroup: null,
          userMarker: null,
          selectedStopPin: null,
          busMarkers: new Map()
        }
      };

      function getScheduleProfile(nowMs) {
        const d = new Date(nowMs);
        const day = d.getDay();
        const mins = d.getHours() * 60 + d.getMinutes();
        const isNight = (mins < 360 || mins >= 1245) && !state.forceDaySimulation;

        if (isNight) {
          return {
            active: false,
            headwayMin: 15,
            busCount: 0,
            badgeText: '🌙 Servizio terminato (06:00–20:45)',
            badgeClass: 'text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 text-white border border-slate-700'
          };
        }
        if (day === 0) {
          return {
            active: true,
            headwayMin: 28,
            busCount: 2,
            badgeText: '🏖️ Festivo (ogni ~28 min)',
            badgeClass: 'text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200'
          };
        }
        const isPeak = (mins >= 420 && mins <= 540) || (mins >= 740 && mins <= 870);
        if (isPeak) {
          return {
            active: true,
            headwayMin: 10,
            busCount: 3,
            badgeText: '⚡ Ora di punta (ogni 10 min)',
            badgeClass: 'text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200'
          };
        }
        return {
          active: true,
          headwayMin: 15,
          busCount: 3,
          badgeText: '🕒 Orario feriale (ogni 15 min)',
          badgeClass: 'text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200'
        };
      }

      /* ========================================================================
         4. SVEGLIA DI PARTENZA ("ESCI ORA")
         ======================================================================== */
      function playDepartureChime() {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          [587.33, 880.0].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);
            gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.18);
            osc.stop(ctx.currentTime + idx * 0.18 + 0.46);
          });
        } catch (e) {}
      }

      function triggerDepartureAlert(arrival) {
        if (!state.alarmEnabled || !arrival) return;
        const alertKey = `${arrival.busId}_${state.selectedStopId}`;
        if (state.lastAlertedBusId === alertKey) return;
        state.lastAlertedBusId = alertKey;

        playDepartureChime();

        const banner = document.getElementById('alarmAlertBanner');
        const text = document.getElementById('alarmAlertText');
        if (banner && text) {
          text.textContent = `🚨 ESCI ORA! Linea 6 tra ${arrival.etaMinutes} min (${state.walkingMinutes} min a piedi)`;
          banner.classList.remove('hidden');
          banner.classList.add('flex');
        }
      }

      /* ========================================================================
         5. INIZIALIZZAZIONE MAPPA (SOLO FERMATE E BUS LIBERI SULLA STRADA)
         ======================================================================== */
      function initMap() {
        state.map = L.map('map', {
          center: [44.1462, 12.2375],
          zoom: 15,
          zoomControl: false
        });

        L.control.zoom({ position: 'topright' }).addTo(state.map);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          className: 'gmaps-tiles',
          attribution: '&copy; OpenStreetMap'
        }).addTo(state.map);

        state.layers.walkLine = L.layerGroup().addTo(state.map);
        state.layers.stopsGroup = L.layerGroup().addTo(state.map);

        // Aggiorna badge modalità GPS libera (senza linee pretracciate)
        const badge = document.getElementById('roadGeometryStatus');
        if (badge) {
          badge.textContent = 'GPS Libero (No Linee)';
          badge.className = 'text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 shrink-0';
        }

        state.map.on('click', (e) => {
          setUserPosition(e.latlng.lat, e.latlng.lng, 'Punto scelto sulla mappa', true);
        });

        setTimeout(() => state.map.invalidateSize(), 150);
      }

      /* ========================================================================
         6. PERCORSO PEDONALE UTENTE -> FERMATA
         ======================================================================== */
      function updatePedestrianPath(userLat, userLon, stop) {
        const straightDist = haversineMeters(userLat, userLon, stop.lat, stop.lon);
        state.walkingMeters = Math.round(straightDist * 1.15);
        state.walkingMinutes = state.walkingMeters < 60 ? 1 : Math.round(state.walkingMeters / 78);

        const walkText = document.getElementById('walkText');
        const walkModeBadge = document.getElementById('walkModeBadge');
        if (walkText) {
          walkText.innerHTML = `📍 <strong>${state.userPos.label}</strong>: <strong>${state.walkingMeters}m</strong> da ${stop.stop_name} (~${state.walkingMinutes} min)`;
        }
        if (walkModeBadge) walkModeBadge.textContent = 'A piedi';

        state.layers.walkLine.clearLayers();
        L.polyline([[userLat, userLon], [stop.lat, stop.lon]], {
          color: '#1A73E8',
          weight: 3,
          dashArray: '4, 7',
          opacity: 0.75
        }).addTo(state.layers.walkLine);

        if (state.pedestrianTimer) clearTimeout(state.pedestrianTimer);
        state.pedestrianTimer = setTimeout(async () => {
          try {
            if (state.pedestrianAbortCtrl) state.pedestrianAbortCtrl.abort();
            state.pedestrianAbortCtrl = new AbortController();

            const url = `https://router.project-osrm.org/route/v1/foot/${userLon},${userLat};${stop.lon},${stop.lat}?overview=full&geometries=geojson`;
            const res = await fetch(url, { signal: state.pedestrianAbortCtrl.signal });
            if (!res.ok) return;
            const data = await res.json();
            const route = data.routes?.[0];
            if (route && route.geometry?.coordinates?.length > 1) {
              const footCoords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
              state.walkingMeters = Math.round(route.distance);
              state.walkingMinutes = state.walkingMeters < 60 ? 1 : Math.round(state.walkingMeters / 78);

              state.layers.walkLine.clearLayers();
              L.polyline([[userLat, userLon], ...footCoords, [stop.lat, stop.lon]], {
                color: '#1A73E8',
                weight: 3,
                dashArray: '5, 7',
                opacity: 0.85
              }).addTo(state.layers.walkLine);

              if (walkText) {
                walkText.innerHTML = `🚶 <strong>${state.userPos.label}</strong>: <strong>${state.walkingMeters}m</strong> reali (~${state.walkingMinutes} min a piedi)`;
              }
              if (walkModeBadge) walkModeBadge.textContent = 'Vialetti OSM';
              lastUiRenderSec = -1;
            }
          } catch (e) {}
        }, 220);
      }

      /* ========================================================================
         7. DISEGNO SOLE FERMATE (ZERO LINEE AZZURRE PRETRACCIATE)
         ======================================================================== */
      function renderDirectionStopsOnly() {
        state.layers.stopsGroup.clearLayers();
        const stops = state.routes[state.direction].stops;

        stops.forEach((stop, idx) => {
          const isTerminus = idx === 0 || idx === stops.length - 1;
          const isCampus = stop.stop_name.toLowerCase().includes('universit') || stop.stop_name.toLowerCase().includes('quasimodo');

          const marker = L.circleMarker([stop.lat, stop.lon], {
            radius: isTerminus ? 6.5 : (isCampus ? 6 : 5),
            fillColor: isTerminus ? '#1A73E8' : '#FFFFFF',
            color: isCampus ? '#E30613' : '#1A73E8',
            weight: 2.5,
            fillOpacity: 1
          });

          marker.bindTooltip(`🚏 ${stop.stop_name} (#${stop.stop_code})`, {
            direction: 'top',
            offset: [0, -6],
            className: 'clean-stop-tooltip'
          });

          marker.on('click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            selectStopById(stop.stop_id, true);
          });

          marker.addTo(state.layers.stopsGroup);
        });
      }

      function renderUserMarker() {
        if (!state.layers.userMarker) {
          const icon = L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `
              <div class="user-blue-dot-wrapper" title="La tua posizione (trascinami)">
                <div class="user-blue-halo"></div>
                <div class="user-blue-core"></div>
              </div>
            `
          });

          state.layers.userMarker = L.marker([state.userPos.lat, state.userPos.lon], {
            icon,
            draggable: true,
            zIndexOffset: 2000
          }).addTo(state.map);

          state.layers.userMarker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            setUserPosition(pos.lat, pos.lng, 'Posizione personalizzata', true);
          });
        } else {
          state.layers.userMarker.setLatLng([state.userPos.lat, state.userPos.lon]);
        }
      }

      function setUserPosition(lat, lon, label, autoSelectNearestStop = true) {
        state.userPos = { lat, lon, label };
        renderUserMarker();

        const stops = state.routes[state.direction].stops;
        if (autoSelectNearestStop) {
          let nearest = stops[0];
          let minD = Infinity;
          stops.forEach(s => {
            const d = haversineMeters(lat, lon, s.lat, s.lon);
            if (d < minD) {
              minD = d;
              nearest = s;
            }
          });
          state.selectedStopId = nearest.stop_id;
          const selectEl = document.getElementById('stopSelect');
          if (selectEl) selectEl.value = nearest.stop_id;
        }

        try {
          localStorage.setItem('linea6_prefs', JSON.stringify({
            direction: state.direction,
            selectedStopId: state.selectedStopId,
            userPos: state.userPos,
            savedAt: Date.now()
          }));
        } catch (e) {}

        updateUserAndStopRelation(false);
      }

      function selectStopById(stopId, panToStop = false) {
        state.selectedStopId = stopId;
        state.lastAlertedBusId = null;
        const selectEl = document.getElementById('stopSelect');
        if (selectEl) selectEl.value = stopId;
        updateUserAndStopRelation(panToStop);
      }

      function updateUserAndStopRelation(panToStop = false) {
        const stops = state.routes[state.direction].stops;
        const stop = stops.find(s => s.stop_id === state.selectedStopId) || stops[0];
        if (!stop) return;

        updatePedestrianPath(state.userPos.lat, state.userPos.lon, stop);

        if (state.layers.selectedStopPin) {
          state.map.removeLayer(state.layers.selectedStopPin);
        }
        const pinIcon = L.divIcon({
          className: '',
          iconSize: [200, 44],
          iconAnchor: [100, 38],
          html: `
            <div class="selected-stop-wrapper">
              <div class="selected-stop-label">🚏 ${stop.stop_name}</div>
              <div class="selected-stop-dot"></div>
            </div>
          `
        });
        state.layers.selectedStopPin = L.marker([stop.lat, stop.lon], {
          icon: pinIcon,
          zIndexOffset: 1500
        }).addTo(state.map);

        if (panToStop && state.map) {
          state.map.panTo([stop.lat, stop.lon], { animate: true });
        }
      }

      /* ========================================================================
         8. TRACKING GPS 2D LIBERO (SENZA SNAP SU POLILINEE PRETRACCIATE)
         ======================================================================== */
      // Trova la fermata superata più vicina alla posizione GPS libera dell'autobus
      function findClosestStopIndex(lat, lon, stops) {
        let bestIdx = 0;
        let minD = Infinity;
        stops.forEach((s, idx) => {
          const d = haversineMeters(lat, lon, s.lat, s.lon);
          if (d < minD) {
            minD = d;
            bestIdx = idx;
          }
        });
        return { index: bestIdx, distanceMeters: minD };
      }

      async function pollBackendLiveApi() {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2200);
          const res = await fetch('/api/linea6/live', { signal: ctrl.signal });
          clearTimeout(timer);
          if (!res.ok) return;
          const data = await res.json();

          // Ignora il simulatore interno con cache a 30s per evitare salti all'indietro
          if (!data.source || data.source.includes('simulator') || data.source.includes('interpolator')) {
            state.backendSyncActive = false;
            return;
          }

          if (data.updated_at && data.updated_at === state.lastServerUpdatedAt) {
            return;
          }
          state.lastServerUpdatedAt = data.updated_at;

          if (!Array.isArray(data.buses) || data.buses.length === 0) return;

          const byDir = { 0: [], 1: [] };
          data.buses.forEach((b, idx) => {
            const dId = Number(b.direction_id ?? b.direction ?? 0) === 1 ? 1 : 0;
            // USA LE COORDINATE GPS GREZZE LIBERE (anche se fuori rotta per deviazioni/lavori!)
            byDir[dId].push({
              id: b.id || b.bus_id || `API-BUS-${idx}`,
              label: b.vehicle_label || `Start Romagna ${601 + idx}`,
              lat: Number(b.lat),
              lon: Number(b.lon),
              bearing: Number(b.bearing || 0),
              speedKmh: Number(b.speed_kmh || 24)
            });
          });

          state.liveApiVehicles = byDir;
          state.backendLastSyncMs = Date.now();
          state.backendSyncActive = true;
        } catch (e) {
          state.backendSyncActive = false;
        }
      }

      function computeLiveBusesForDirection(dirId, nowMs, schedule) {
        if (!schedule.active) return [];

        const routeObj = state.routes[dirId];
        const stops = routeObj.stops;
        const pts = routeObj.gpsStream;
        const totalPts = pts.length;
        const tripDurationSec = 1440; // 24 min
        const nowSec = nowMs / 1000;

        // 1. Se ci sono coordinate GPS raw da API esterna, muovi liberamente in 2D (Dead Reckoning)
        const rawVehicles = (state.backendSyncActive && (nowMs - state.backendLastSyncMs < 35000) && state.liveApiVehicles[dirId]?.length)
          ? state.liveApiVehicles[dirId]
          : null;

        if (rawVehicles) {
          const dtSec = Math.min(30, (nowMs - state.backendLastSyncMs) / 1000);
          return rawVehicles.map(v => {
            // Avanzamento predittivo lungo il vettore bussola reale (bearing)
            const speedMps = (v.speedKmh || 20) / 3.6;
            const distM = speedMps * dtSec * 0.5;
            const rad = (v.bearing * Math.PI) / 180;
            const dLat = (distM * Math.cos(rad)) / 111320;
            const dLon = (distM * Math.sin(rad)) / (111320 * Math.cos((v.lat * Math.PI) / 180));
            const lat = v.lat + dLat;
            const lon = v.lon + dLon;

            const closest = findClosestStopIndex(lat, lon, stops);
            const nextIdx = Math.min(closest.index + 1, stops.length - 1);

            return {
              id: v.id,
              label: v.label,
              direction: dirId,
              destination: dirId === 0 ? 'Montefiore' : 'Rio Maggiore',
              lat,
              lon,
              bearing: v.bearing,
              status: closest.distanceMeters < 28 ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
              currentStopIndex: closest.index,
              nextStopIndex: nextIdx,
              currentStop: stops[closest.index],
              nextStop: stops[nextIdx]
            };
          });
        }

        // 2. Flusso GPS continuo su strada (senza alcuna linea disegnata sulla mappa)
        const buses = [];
        const headwaySec = schedule.headwayMin * 60;

        for (let idx = 0; idx < schedule.busCount; idx++) {
          const offsetSec = idx * headwaySec;
          const cyclePos = ((nowSec + offsetSec) % tripDurationSec) / tripDurationSec;
          const exactPt = cyclePos * (totalPts - 1);
          const pIdx = Math.min(Math.floor(exactPt), totalPts - 2);
          const frac = exactPt - pIdx;

          const pA = pts[pIdx];
          const pB = pts[pIdx + 1];
          const lat = pA[0] + (pB[0] - pA[0]) * frac;
          const lon = pA[1] + (pB[1] - pA[1]) * frac;
          const bearing = computeBearing(pA[0], pA[1], pB[0], pB[1]);

          const closest = findClosestStopIndex(lat, lon, stops);
          const nextIdx = Math.min(closest.index + 1, stops.length - 1);

          buses.push({
            id: `CE-60${idx + 1}-D${dirId}`,
            label: `Start Romagna ${601 + idx + dirId * 10}`,
            direction: dirId,
            destination: dirId === 0 ? 'Montefiore' : 'Rio Maggiore',
            lat,
            lon,
            bearing,
            status: closest.distanceMeters < 25 ? 'STOPPED_AT' : 'IN_TRANSIT_TO',
            currentStopIndex: closest.index,
            nextStopIndex: nextIdx,
            currentStop: stops[closest.index],
            nextStop: stops[nextIdx]
          });
        }

        return buses;
      }

      // Calcola l'arrivo basandosi sulla distanza reale (funziona anche se il bus è in deviazione!)
      function computeArrivalsForSelectedStop(liveBuses, nowMs, schedule) {
        const stops = state.routes[state.direction].stops;
        const userStopIdx = stops.findIndex(s => s.stop_id === state.selectedStopId);
        const targetStop = stops[userStopIdx >= 0 ? userStopIdx : 0];

        const arrivals = [];

        if (schedule.active) {
          liveBuses.forEach(bus => {
            if (bus.currentStopIndex <= (userStopIdx >= 0 ? userStopIdx : 0)) {
              // Distanza reale in metri (con coefficiente stradale urbano 1.28x, anche su deviazioni)
              const straightM = haversineMeters(bus.lat, bus.lon, targetStop.lat, targetStop.lon);
              const roadDistanceM = straightM * 1.28;
              // Velocità media commerciale urbana ~22 km/h (6.1 m/s)
              const etaSeconds = Math.round(roadDistanceM / 6.1);
              const etaMinutes = Math.max(0, Math.round(etaSeconds / 60));
              const stopsAway = Math.max(0, (userStopIdx >= 0 ? userStopIdx : 0) - bus.currentStopIndex);

              arrivals.push({
                busId: bus.id,
                vehicleLabel: bus.label,
                destination: bus.destination,
                isLive: true,
                etaSeconds,
                etaMinutes,
                stopsAway,
                bus
              });
            }
          });

          arrivals.sort((a, b) => a.etaSeconds - b.etaSeconds);
        }

        let lastEtaMin = arrivals.length > 0 ? arrivals[arrivals.length - 1].etaMinutes : 4;
        while (arrivals.length < 4) {
          lastEtaMin += schedule.headwayMin;
          arrivals.push({
            busId: null,
            vehicleLabel: 'Corsa Start Romagna',
            destination: state.direction === 0 ? 'Montefiore' : 'Rio Maggiore',
            isLive: false,
            etaSeconds: lastEtaMin * 60,
            etaMinutes: lastEtaMin,
            stopsAway: Math.max(2, userStopIdx)
          });
        }

        arrivals.forEach(arr => {
          const arrivalDate = new Date(nowMs + arr.etaSeconds * 1000);
          arr.clockTime = arrivalDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

          const margin = arr.etaMinutes - state.walkingMinutes;
          if (margin >= 2) {
            arr.catchState = {
              code: 'EASY',
              bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
              badge: `🟢 Sì, fai in tempo a piedi (+${margin} min di margine)`
            };
          } else if (margin >= 0) {
            arr.catchState = {
              code: 'HURRY',
              bg: 'bg-amber-50 border-amber-200 text-amber-800',
              badge: `🟡 Esci subito! Hai solo ${margin} min di margine`
            };
          } else {
            arr.catchState = {
              code: 'MISSED',
              bg: 'bg-rose-50 border-rose-200 text-rose-800',
              badge: `🔴 Troppo vicino (${arr.etaMinutes} min vs ${state.walkingMinutes} min a piedi) • Punta al successivo`
            };
          }
        });

        const firstCatchable = arrivals.find(a => a.etaMinutes >= state.walkingMinutes);
        if (schedule.active && state.alarmEnabled && firstCatchable) {
          const margin = firstCatchable.etaMinutes - state.walkingMinutes;
          if (margin <= 2 && margin >= 0) {
            triggerDepartureAlert(firstCatchable);
          }
        }

        return { targetStop, arrivals };
      }

      /* ========================================================================
         9. RENDERING SOLO MARKER AUTOBUS (ZERO POLILINEE BLU/AZZURRE)
         ======================================================================== */
      function updateMapBusesOnly(liveBuses, arrivalsInfo) {
        const primaryBusId = arrivalsInfo.arrivals[0]?.busId || null;
        const activeIds = new Set(liveBuses.map(b => b.id));

        for (const [id, marker] of state.layers.busMarkers.entries()) {
          if (!activeIds.has(id)) {
            state.map.removeLayer(marker);
            state.layers.busMarkers.delete(id);
          }
        }

        liveBuses.forEach(bus => {
          const isPrimary = bus.id === primaryBusId;
          const matchingArrival = arrivalsInfo.arrivals.find(a => a.busId === bus.id);
          const pillText = matchingArrival
            ? (matchingArrival.etaMinutes <= 0 ? 'Bus 6 • In arrivo' : `Bus 6 • a ${matchingArrival.etaMinutes} min da te`)
            : `Bus 6 ➔ ${bus.nextStop.stop_name.split(' ')[0]}`;

          let marker = state.layers.busMarkers.get(bus.id);
          if (!marker) {
            const icon = L.divIcon({
              className: '',
              iconSize: [46, 46],
              iconAnchor: [23, 23],
              html: `
                <div class="bus-live-wrapper">
                  <div class="bus-radar-wave"></div>
                  <div class="bus-compass-ring" style="transform: rotate(${bus.bearing.toFixed(1)}deg)">
                    <div class="bus-heading-arrow"></div>
                  </div>
                  <div class="bus-circle-body ${isPrimary ? 'is-primary' : ''}">6</div>
                  <div class="bus-pill-tag">${pillText}</div>
                </div>
              `
            });

            marker = L.marker([bus.lat, bus.lon], {
              icon,
              zIndexOffset: isPrimary ? 1800 : 1200
            }).addTo(state.map);

            marker.on('click', () => {
              state.followedBusId = bus.id;
              state.map.flyTo([bus.lat, bus.lon], 16, { duration: 0.6 });
            });

            state.layers.busMarkers.set(bus.id, marker);
          } else {
            marker.setLatLng([bus.lat, bus.lon]);
            const el = marker.getElement();
            if (el) {
              const ring = el.querySelector('.bus-compass-ring');
              if (ring) ring.style.transform = `rotate(${bus.bearing.toFixed(1)}deg)`;
              const body = el.querySelector('.bus-circle-body');
              if (body) body.className = `bus-circle-body ${isPrimary ? 'is-primary' : ''}`;
              const tag = el.querySelector('.bus-pill-tag');
              if (tag && tag.textContent !== pillText) tag.textContent = pillText;
            }
          }

          if (state.followedBusId === bus.id) {
            state.map.panTo([bus.lat, bus.lon], { animate: false });
          }
        });
      }

      let lastUiRenderSec = -1;

      function updatePassengerCardUI(arrivalsInfo, nowMs, schedule) {
        const nowSec = Math.floor(nowMs / 1000);
        if (nowSec === lastUiRenderSec) return;
        lastUiRenderSec = nowSec;

        const clockEl = document.getElementById('liveClock');
        if (clockEl) {
          clockEl.textContent = new Date(nowMs).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        }

        const schedBadge = document.getElementById('scheduleBadge');
        if (schedBadge) {
          schedBadge.textContent = schedule.badgeText;
          schedBadge.className = schedule.badgeClass;
        }

        const nightBanner = document.getElementById('nightServiceBanner');
        if (nightBanner) {
          nightBanner.classList.toggle('hidden', schedule.active);
        }

        const first = arrivalsInfo.arrivals[0];
        const heroBox = document.getElementById('heroArrivalBox');
        if (heroBox && first) {
          const etaLabel = !schedule.active
            ? 'Domani 06:05'
            : (first.etaMinutes <= 0 ? 'In arrivo ora' : `tra ${first.etaMinutes} min`);

          const subStatus = !schedule.active
            ? '🌙 Nessun bus notturno in circolazione • Premi "Simula Diurno" per testare la mappa'
            : (first.isLive
                ? `<span class="text-emerald-600 font-bold">((•)) POSIZIONE LIBERA</span> • a <strong>${first.stopsAway} fermate</strong> da te (zona <em>${first.bus.currentStop.stop_name}</em>)`
                : `📅 Corsa programmata da orario Start Romagna • a ${first.stopsAway} fermate da te`);

          heroBox.innerHTML = `
            <div class="flex items-baseline justify-between">
              <div class="text-3xl font-black text-slate-900 tracking-tight">${etaLabel}</div>
              <div class="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                ore ${schedule.active ? first.clockTime : '06:05'}
              </div>
            </div>
            <div class="text-xs text-slate-600 mt-1.5 leading-snug">
              ${subStatus}
            </div>
            <div class="mt-2.5 px-3 py-2 rounded-xl border text-xs font-bold ${first.catchState.bg}">
              ${first.catchState.badge}
            </div>
            <button id="btnFocusPrimaryBus" type="button" class="mt-2.5 w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm">
              <span>🚌</span> Centra questo autobus sulla mappa
            </button>
          `;

          const btnFocus = document.getElementById('btnFocusPrimaryBus');
          if (btnFocus) {
            btnFocus.onclick = () => {
              if (first.bus) {
                state.followedBusId = first.bus.id;
                state.map.flyTo([first.bus.lat, first.bus.lon], 16, { duration: 0.7 });
              } else {
                state.map.flyTo([arrivalsInfo.targetStop.lat, arrivalsInfo.targetStop.lon], 16, { duration: 0.7 });
              }
            };
          }
        }

        const subList = document.getElementById('subsequentBusesList');
        if (subList) {
          const nextThree = arrivalsInfo.arrivals.slice(1, 4);
          subList.innerHTML = nextThree.map(item => `
            <div data-bus-id="${item.busId || ''}" class="sub-bus-row flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 cursor-pointer transition">
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-md bg-blue-600 text-white text-[11px] font-extrabold flex items-center justify-center">6</span>
                <div>
                  <div class="text-xs font-bold text-slate-800">➔ ${item.destination}</div>
                  <div class="text-[10px] text-slate-500">
                    ${item.isLive ? '🟢 GPS Live in strada' : '🕒 Corsa da orario'} • ${item.catchState.code === 'EASY' ? 'Fai in tempo comodamente' : 'In orario'}
                  </div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs font-extrabold text-slate-900">tra ${item.etaMinutes} min</div>
                <div class="text-[10px] font-semibold text-slate-400">ore ${item.clockTime}</div>
              </div>
            </div>
          `).join('');

          subList.querySelectorAll('.sub-bus-row').forEach(row => {
            row.onclick = () => {
              const bId = row.getAttribute('data-bus-id');
              const marker = bId ? state.layers.busMarkers.get(bId) : null;
              if (marker) {
                state.followedBusId = bId;
                state.map.flyTo(marker.getLatLng(), 16, { duration: 0.7 });
              }
            };
          });
        }
      }

      /* ========================================================================
         10. CONTROLLI UI E PRESET MATTINA/SERA
         ======================================================================== */
      function populateStopDropdown() {
        const selectEl = document.getElementById('stopSelect');
        if (!selectEl) return;
        const stops = state.routes[state.direction].stops;
        selectEl.innerHTML = stops.map(s =>
          `<option value="${s.stop_id}">${s.stop_name} (#${s.stop_code})</option>`
        ).join('');
        selectEl.value = state.selectedStopId;
      }

      function updateDirectionButtonsUI() {
        const btn0 = document.getElementById('btnDir0');
        const btn1 = document.getElementById('btnDir1');
        if (!btn0 || !btn1) return;
        if (state.direction === 0) {
          btn0.className = 'py-2 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-blue-600 shadow-sm flex items-center justify-center gap-1';
          btn1.className = 'py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1';
        } else {
          btn1.className = 'py-2 px-2.5 rounded-lg text-xs font-bold transition-all bg-white text-blue-600 shadow-sm flex items-center justify-center gap-1';
          btn0.className = 'py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1';
        }
      }

      function switchDirection(newDir, customStopId = null) {
        state.direction = newDir;
        state.followedBusId = null;
        updateDirectionButtonsUI();
        renderDirectionStopsOnly();

        if (customStopId) {
          state.selectedStopId = customStopId;
          setUserPosition(state.userPos.lat, state.userPos.lon, state.userPos.label, false);
        } else {
          setUserPosition(state.userPos.lat, state.userPos.lon, state.userPos.label, true);
        }

        populateStopDropdown();
        lastUiRenderSec = -1;
      }

      function applyMorningCommute(pan = true) {
        state.userPos = { ...STAZIONE_COORDS };
        renderUserMarker();
        switchDirection(1, 'CE_6111');
        if (pan && state.map) state.map.flyTo([STAZIONE_COORDS.lat, STAZIONE_COORDS.lon], 15, { duration: 0.7 });
      }

      function applyEveningCommute(pan = true) {
        state.userPos = { ...CAMPUS_COORDS };
        renderUserMarker();
        switchDirection(0, 'CE_6008');
        if (pan && state.map) state.map.flyTo([CAMPUS_COORDS.lat, CAMPUS_COORDS.lon], 16, { duration: 0.7 });
      }

      function initSmartCommuteDefault() {
        try {
          const raw = localStorage.getItem('linea6_prefs');
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved && (Date.now() - saved.savedAt < 45 * 60 * 1000)) {
              state.userPos = saved.userPos || { ...CAMPUS_COORDS };
              renderUserMarker();
              switchDirection(saved.direction || 0, saved.selectedStopId || 'CE_6008');
              return;
            }
          }
        } catch (e) {}

        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) {
          applyMorningCommute(false);
        } else {
          applyEveningCommute(false);
        }
      }

      function bindEvents() {
        document.getElementById('btnDir0')?.addEventListener('click', () => switchDirection(0));
        document.getElementById('btnDir1')?.addEventListener('click', () => switchDirection(1));
        document.getElementById('chipMorningCommute')?.addEventListener('click', () => applyMorningCommute(true));
        document.getElementById('chipEveningCommute')?.addEventListener('click', () => applyEveningCommute(true));

        document.getElementById('btnForceDaySim')?.addEventListener('click', () => {
          state.forceDaySimulation = true;
          lastUiRenderSec = -1;
        });

        document.getElementById('stopSelect')?.addEventListener('change', (e) => {
          state.followedBusId = null;
          selectStopById(e.target.value, true);
          lastUiRenderSec = -1;
        });

        document.getElementById('btnLocateCampus')?.addEventListener('click', () => applyEveningCommute(true));

        document.getElementById('btnRealGps')?.addEventListener('click', () => {
          state.followedBusId = null;
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (pos.coords.accuracy > 400) {
                  setUserPosition(CAMPUS_COORDS.lat, CAMPUS_COORDS.lon, 'Campus Universitario (GPS PC)', true);
                  state.map.flyTo([CAMPUS_COORDS.lat, CAMPUS_COORDS.lon], 16, { duration: 0.7 });
                } else {
                  setUserPosition(pos.coords.latitude, pos.coords.longitude, 'La tua posizione GPS', true);
                  state.map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.7 });
                }
                lastUiRenderSec = -1;
              },
              () => {
                setUserPosition(CAMPUS_COORDS.lat, CAMPUS_COORDS.lon, 'Campus Universitario', true);
                state.map.flyTo([CAMPUS_COORDS.lat, CAMPUS_COORDS.lon], 16, { duration: 0.7 });
                lastUiRenderSec = -1;
              },
              { enableHighAccuracy: true, timeout: 5000 }
            );
          }
        });

        document.getElementById('btnToggleAlarm')?.addEventListener('click', () => {
          state.alarmEnabled = !state.alarmEnabled;
          state.lastAlertedBusId = null;
          const btn = document.getElementById('btnToggleAlarm');
          const txt = document.getElementById('alarmBtnText');
          const pill = document.getElementById('alarmStatusPill');

          if (state.alarmEnabled) {
            playDepartureChime();
            if (btn) btn.className = 'w-full py-1.5 px-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold flex items-center justify-between transition';
            if (txt) txt.textContent = '🔔 Sveglia attiva (avviso a +2 min margine)';
            if (pill) {
              pill.textContent = 'ON';
              pill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white';
            }
          } else {
            if (btn) btn.className = 'w-full py-1.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-between transition';
            if (txt) txt.textContent = '🔔 Attiva sveglia "Esci ora"';
            if (pill) {
              pill.textContent = 'OFF';
              pill.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500';
            }
            document.getElementById('alarmAlertBanner')?.classList.add('hidden');
          }
        });

        document.getElementById('btnDismissAlarm')?.addEventListener('click', () => {
          document.getElementById('alarmAlertBanner')?.classList.add('hidden');
        });

        document.getElementById('fabCenterUser')?.addEventListener('click', () => {
          state.followedBusId = null;
          state.map.flyTo([state.userPos.lat, state.userPos.lon], 16, { duration: 0.6 });
        });

        document.getElementById('fabFitRoute')?.addEventListener('click', () => {
          state.followedBusId = null;
          const stops = state.routes[state.direction].stops.map(s => [s.lat, s.lon]);
          state.map.fitBounds(L.latLngBounds(stops), { padding: [50, 50] });
        });

        document.getElementById('mobileHandle')?.addEventListener('click', () => {
          document.getElementById('transitPanel')?.classList.toggle('collapsed');
        });
      }

      /* ========================================================================
         11. LOOP DI ANIMAZIONE 60 FPS E AVVIO
         ======================================================================== */
      function animationLoop() {
        const nowMs = Date.now();
        const schedule = getScheduleProfile(nowMs);
        const liveBuses = computeLiveBusesForDirection(state.direction, nowMs, schedule);
        const arrivalsInfo = computeArrivalsForSelectedStop(liveBuses, nowMs, schedule);

        updateMapBusesOnly(liveBuses, arrivalsInfo);
        updatePassengerCardUI(arrivalsInfo, nowMs, schedule);

        requestAnimationFrame(animationLoop);
      }

      window.addEventListener('DOMContentLoaded', () => {
        initMap();
        initSmartCommuteDefault();
        bindEvents();
        requestAnimationFrame(animationLoop);
        pollBackendLiveApi();
        setInterval(pollBackendLiveApi, 5000);
      });
    })();
  </script>
</body>
</html>
```

---
*Bundle generato per l'analisi e il potenziamento con Google Gemini.*
