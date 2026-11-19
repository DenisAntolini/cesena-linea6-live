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

// Cache in memoria posizioni bus live (TTL 20 secondi)
let liveCache = {
  updated_at: null,
  last_updated_ms: 0,
  source: 'start_infobus_live',
  buses: []
};

/**
 * Carica i dati statici ufficiali da data/linea6.json.
 */
function getStaticData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      throw new Error(`File ${DATA_FILE} mancante. Esegui 'node scripts/build-real-stops.js' prima.`);
    }
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Errore durante la lettura di data/linea6.json:', err.message);
    return { error: err.message, stops: [] };
  }
}

/**
 * Aggiorna la cache live leggendo i bus reali da Start Romagna.
 * ZERO SIMULATORI: se non ci sono corse attive, buses = [].
 */
async function refreshLiveCache() {
  try {
    const staticData = getStaticData();
    const buses = await getRealLiveBuses(staticData);

    liveCache = {
      updated_at: new Date().toISOString(),
      last_updated_ms: Date.now(),
      source: 'start_infobus_live',
      buses: buses || []
    };

    console.log(
      `[Cache Start Romagna] Aggiornata: ${liveCache.updated_at} | Autobus reali in linea: ${liveCache.buses.length}`
    );
  } catch (err) {
    console.error('[Cache Start Romagna] Errore aggiornamento live:', err.message);
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
app.get('/api/linea6/live', async (req, res) => {
  const now = Date.now();
  // Se la cache ha più di 15 secondi (o vuota all'avvio su Vercel Serverless), aggiorna subito
  if (!liveCache.last_updated_ms || (now - liveCache.last_updated_ms > 15000)) {
    await refreshLiveCache();
  }

  const elapsedSec = liveCache.last_updated_ms
    ? Math.floor((Date.now() - liveCache.last_updated_ms) / 1000)
    : 0;
  const nextUpdateInSec = Math.max(0, CACHE_INTERVAL_SEC - elapsedSec);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
  res.status(200).json({
    updated_at: liveCache.updated_at,
    next_update_in_sec: nextUpdateInSec,
    source: 'start_infobus_live',
    buses_count: liveCache.buses.length,
    buses: liveCache.buses
  });
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
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
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
  const cacheAgeSec = liveCache.last_updated_ms
    ? Math.floor((Date.now() - liveCache.last_updated_ms) / 1000)
    : null;
  const nowRome = getRomeTimeParts();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    status: 'ok',
    service: 'cesena-linea6-live',
    rome_time: nowRome.timeString,
    uptime_sec: uptimeSec,
    cache_age_sec: cacheAgeSec,
    cache_ttl_sec: CACHE_INTERVAL_SEC,
    source: 'start_infobus_live',
    buses_count: liveCache.buses.length,
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
  await refreshLiveCache();

  const timerId = setInterval(refreshLiveCache, CACHE_INTERVAL_MS);
  timerId.unref();

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
    "cheerio": "^1.2.0",
    "cors": "^2.8.6",
    "csv-parse": "^7.0.3",
    "express": "^5.3.0"
  },
  "devDependencies": {
    "ws": "^8.23.0"
  }
}
```

### 6. `services/liveTracker.js`
```javascript
/**
 * services/liveTracker.js
 * Motore di tracciamento REALTIME basato al 100% su InfoBus Start Romagna.
 * ZERO SIMULATORI - Dati reali diretti.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

// Cache in memoria con TTL
const STOP_BOARD_CACHE_TTL_MS = 20 * 1000; // 20 secondi per le paline
const PERCORSO_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minuti per i percorsi dei trip
const stopBoardCache = new Map();
const percorsoCache = new Map();

/**
 * Calcola ora, minuti e secondi correnti nel fuso orario obbligatorio Europe/Rome.
 * Risolve la discrepanza UTC di Vercel Serverless.
 */
function getRomeTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const second = parseInt(parts.find(p => p.type === 'second').value, 10);
  const totalMinutes = hour * 60 + minute;
  const totalSeconds = totalMinutes * 60 + second;
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, second, totalMinutes, totalSeconds, timeString };
}

/**
 * Converte "HH:MM" in minuti totali dall'inizio della giornata.
 */
function timeStrToMinutes(str) {
  if (!str || typeof str !== 'string' || !str.includes(':')) return null;
  const [h, m] = str.split(':').map(x => parseInt(x, 10));
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converte "HH:MM" in secondi totali dall'inizio della giornata.
 */
function timeStrToSeconds(str) {
  const min = timeStrToMinutes(str);
  return min !== null ? min * 60 : null;
}

/**
 * Calcola l'angolo di direzione (bearing / azimut) in gradi.
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return Math.round(((toDeg(theta) + 360) % 360) * 10) / 10;
}

/**
 * Distanza geodetica in metri tra due coordinate (formula Haversine).
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Parsing robusto dello stato live restituito da Start Romagna.
 * Gestisce: "+ 2 minuti", "- 1 minuti", "11:45", "In arrivo", "SOPP", ecc.
 */
function parseStartRomagnaStatus(statusText, scheduledTimeStr, nowRome) {
  const schedMinutes = timeStrToMinutes(scheduledTimeStr);
  let liveMinutes = schedMinutes;
  let delayMinutes = 0;
  let statusClass = 'on-time';
  let isCancelled = false;
  const cleanText = (statusText || '').trim();

  if (/sopp/i.test(cleanText)) {
    isCancelled = true;
    statusClass = 'sopp';
    return {
      isCancelled,
      statusClass,
      liveTimeStr: 'SOPP',
      liveMinutes: null,
      delayMinutes: 0,
      etaMinutes: null,
      displayText: 'CORSA SOPPRESSA'
    };
  }

  const delayMatch = cleanText.match(/([+-]?\s*\d+)\s*min/i);
  if (delayMatch) {
    delayMinutes = parseInt(delayMatch[1].replace(/\s+/g, ''), 10) || 0;
    if (schedMinutes !== null) {
      liveMinutes = schedMinutes + delayMinutes;
    }
    if (delayMinutes > 2) statusClass = 'delayed';
    else if (delayMinutes < -1) statusClass = 'early';
  } else if (/^\d{1,2}:\d{2}$/.test(cleanText)) {
    const absMin = timeStrToMinutes(cleanText);
    if (absMin !== null && schedMinutes !== null) {
      liveMinutes = absMin;
      delayMinutes = liveMinutes - schedMinutes;
    }
    if (delayMinutes > 2) statusClass = 'delayed';
  } else if (/arriv/i.test(cleanText)) {
    liveMinutes = nowRome.totalMinutes;
    delayMinutes = schedMinutes !== null ? liveMinutes - schedMinutes : 0;
    statusClass = 'arriving';
  }

  const liveHour = liveMinutes !== null ? Math.floor(liveMinutes / 60) % 24 : 0;
  const liveMinPart = liveMinutes !== null ? liveMinutes % 60 : 0;
  const liveTimeStr = liveMinutes !== null
    ? `${String(liveHour).padStart(2, '0')}:${String(liveMinPart).padStart(2, '0')}`
    : scheduledTimeStr;

  const etaMinutes = liveMinutes !== null ? liveMinutes - nowRome.totalMinutes : null;

  return {
    isCancelled,
    statusClass,
    liveTimeStr,
    liveMinutes,
    delayMinutes,
    etaMinutes,
    displayText: cleanText || liveTimeStr
  };
}

/**
 * Scarica la lavagna arrivi in tempo reale di una fermata da InfoBus Start Romagna.
 */
async function fetchStopBoard(targetId, palina) {
  const cacheKey = `${targetId}_${palina}`;
  const cached = stopBoardCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const url = `https://infobus.startromagna.it/InfoFermata?param=${targetId}&param2=fc&palina=${palina}`;
  const nowRome = getRomeTimeParts();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} da InfoBus Start Romagna`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const arrivals = [];

    $('.bus-card').each((_, el) => {
      const headerText = $(el).find('.bus-header > span').clone().children().remove().end().text().trim();
      const isLine6 = /linea\s*6\b|^\s*6[A-Z]?\b/i.test(headerText);
      if (!isLine6) return;

      const scheduledTime = $(el).find('.bus-times span:first-child').text().trim();
      const statusEl = $(el).find('.bus-status');
      const statusText = statusEl.text().trim();
      const destText = $(el).find('.bus-destination').text().trim();
      const btn = $(el).find('.dettaglio-btn');
      const tripId = btn.attr('data-trip') || null;
      const vehicleId = btn.attr('data-vehicle') || null;

      const destUpper = destText.toUpperCase();
      const directionId = destUpper.includes('MONTEFIORE') ? '0' : (destUpper.includes('RIO MAGGIORE') ? '1' : null);

      const parsedStatus = parseStartRomagnaStatus(statusText, scheduledTime, nowRome);

      arrivals.push({
        line: '6',
        destination: destText,
        direction_id: directionId,
        scheduled_time: scheduledTime,
        live_time: parsedStatus.liveTimeStr,
        eta_minutes: parsedStatus.etaMinutes,
        delay_minutes: parsedStatus.delayMinutes,
        status_text: parsedStatus.displayText,
        status_class: parsedStatus.statusClass,
        is_cancelled: parsedStatus.isCancelled,
        trip_id: tripId,
        vehicle_id: vehicleId,
        palina: String(palina)
      });
    });

    stopBoardCache.set(cacheKey, {
      data: arrivals,
      expiresAt: now + STOP_BOARD_CACHE_TTL_MS
    });

    return arrivals;
  } catch (err) {
    console.error(`[InfoBus] Errore fetchStopBoard palina ${palina}:`, err.message);
    if (cached) return cached.data;
    return [];
  }
}

/**
 * Scarica la tabella di marcia di un singolo trip da GetPercorso.
 */
async function fetchTripPercorso(tripId, palina = '6721') {
  if (!tripId) return [];
  const cached = percorsoCache.get(tripId);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return cached.stops;
  }

  try {
    const res = await fetch('https://infobus.startromagna.it/PercorsoService.asmx/GetPercorso', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ trip_id: tripId, palina: String(palina) })
    });

    const json = await res.json();
    const rawStops = typeof json.d === 'string' ? JSON.parse(json.d) : json.d;
    if (!Array.isArray(rawStops)) return [];

    const sorted = rawStops.sort((a, b) => a.stop_sequence - b.stop_sequence);
    percorsoCache.set(tripId, {
      stops: sorted,
      expiresAt: now + PERCORSO_CACHE_TTL_MS
    });

    return sorted;
  } catch (err) {
    console.error(`[InfoBus] Errore fetchTripPercorso trip ${tripId}:`, err.message);
    if (cached) return cached.stops;
    return [];
  }
}

/**
 * Calcola la posizione reale dei bus attivi interpolando le coordinate delle fermate del percorso.
 * ZERO SIMULATORI: se non ci sono corse attive, restituisce [].
 */
async function getRealLiveBuses(staticData) {
  const routes = staticData.routes_by_direction || {};
  const stopsDir0 = routes['0']?.stops || [];
  const stopsDir1 = routes['1']?.stops || [];

  // Mappa rapida per ottenere coordinate (lat, lon) e nome per qualsiasi palina
  const stopCoordsMap = new Map();
  [...stopsDir0, ...stopsDir1].forEach(s => {
    stopCoordsMap.set(String(s.stop_id), { lat: s.lat, lon: s.lon, stop_name: s.stop_name });
  });

  // Fermate sonda per catturare tutti i bus in circolazione su entrambe le direzioni
  const probeStops = [
    { target_id: '2985', palina: '6721' }, // Quasimodo (passano entrambe le direzioni)
    { target_id: '2495', palina: '5161' }, // Cesena FS
    { target_id: '2602', palina: '5692' }, // Ghirotti Ospedale
    { target_id: '2983', palina: '6700' }, // Rio Maggiore
    { target_id: '2994', palina: '6770' }  // Montefiore
  ];

  const boardResults = await Promise.allSettled(
    probeStops.map(p => fetchStopBoard(p.target_id, p.palina))
  );

  const activeTripsMap = new Map();
  for (const r of boardResults) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const item of r.value) {
        if (!item.trip_id || item.is_cancelled) continue;
        if (!activeTripsMap.has(item.trip_id)) {
          activeTripsMap.set(item.trip_id, item);
        } else {
          // Se presente, prendi il dato con ETA più basso o veicolo valorizzato
          const existing = activeTripsMap.get(item.trip_id);
          if (!existing.vehicle_id && item.vehicle_id) {
            existing.vehicle_id = item.vehicle_id;
          }
        }
      }
    }
  }

  const nowRome = getRomeTimeParts();
  const currentTotalSeconds = nowRome.totalSeconds;
  const liveBuses = [];

  for (const [tripId, tripMeta] of activeTripsMap.entries()) {
    const rawPercorso = await fetchTripPercorso(tripId, tripMeta.palina || '6721');
    if (!rawPercorso || rawPercorso.length < 2) continue;

    // Aggiusta gli orari di fermata con il ritardo effettivo rilevato
    const delaySec = (tripMeta.delay_minutes || 0) * 60;
    const adjustedStops = rawPercorso.map(s => {
      const scheduledSec = timeStrToSeconds(s.departure_time || s.arrival_time) || 0;
      return {
        ...s,
        adjustedSec: scheduledSec + delaySec,
        coords: stopCoordsMap.get(String(s.stop_id)) || null
      };
    });

    const firstStop = adjustedStops[0];
    const lastStop = adjustedStops[adjustedStops.length - 1];

    // Se la corsa è terminata da più di 5 minuti o deve iniziare tra più di 15 minuti, scartala
    if (currentTotalSeconds > lastStop.adjustedSec + 300) continue;
    if (currentTotalSeconds < firstStop.adjustedSec - 900) continue;

    let stopA = firstStop;
    let stopB = adjustedStops[1];
    let progress = 0;
    let statusText = 'IN_TRANSITO';

    if (currentTotalSeconds <= firstStop.adjustedSec) {
      // In attesa al capolinea di partenza
      stopA = firstStop;
      stopB = adjustedStops[1];
      progress = 0;
      statusText = 'AL_CAPOLINEA';
    } else if (currentTotalSeconds >= lastStop.adjustedSec) {
      // Arrivato al capolinea finale
      stopA = adjustedStops[adjustedStops.length - 2] || firstStop;
      stopB = lastStop;
      progress = 1;
      statusText = 'ARRIVATO';
    } else {
      // In viaggio tra due fermate consecutive
      for (let i = 0; i < adjustedStops.length - 1; i++) {
        const s1 = adjustedStops[i];
        const s2 = adjustedStops[i + 1];
        if (currentTotalSeconds >= s1.adjustedSec && currentTotalSeconds <= s2.adjustedSec) {
          stopA = s1;
          stopB = s2;
          const span = Math.max(10, s2.adjustedSec - s1.adjustedSec);
          progress = Math.min(1, Math.max(0, (currentTotalSeconds - s1.adjustedSec) / span));
          break;
        }
      }
    }

    const coordsA = stopA.coords || { lat: 44.14000, lon: 12.24000 };
    const coordsB = stopB.coords || coordsA;

    const lat = coordsA.lat + (coordsB.lat - coordsA.lat) * progress;
    const lon = coordsA.lon + (coordsB.lon - coordsA.lon) * progress;
    const bearing = calculateBearing(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);

    liveBuses.push({
      id: tripMeta.vehicle_id ? `bus_${tripMeta.vehicle_id}` : `trip_${tripId}`,
      vehicle_id: tripMeta.vehicle_id || 'N.D.',
      trip_id: tripId,
      direction_id: tripMeta.direction_id || '0',
      destination: tripMeta.destination,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      bearing,
      delay_minutes: tripMeta.delay_minutes || 0,
      status: statusText,
      status_text: tripMeta.status_text,
      current_stop: {
        stop_id: String(stopA.stop_id),
        stop_name: stopA.coords?.stop_name || stopA.stop_name
      },
      next_stop: {
        stop_id: String(stopB.stop_id),
        stop_name: stopB.coords?.stop_name || stopB.stop_name
      },
      is_live: true,
      last_sync_rome: nowRome.timeString
    });
  }

  // Deduplicazione per veicolo (evita doppioni se lo stesso bus ha il trip attuale e il successivo in coda)
  const uniqueBusesMap = new Map();
  for (const b of liveBuses) {
    const key = b.vehicle_id !== 'N.D.' ? b.vehicle_id : b.trip_id;
    if (!uniqueBusesMap.has(key)) {
      uniqueBusesMap.set(key, b);
    } else {
      const existing = uniqueBusesMap.get(key);
      if (b.status === 'IN_TRANSITO' && existing.status !== 'IN_TRANSITO') {
        uniqueBusesMap.set(key, b);
      }
    }
  }

  return [...uniqueBusesMap.values()];
}

/**
 * Calcola gli arrivi in tempo reale e la fattibilità a piedi per la fermata richiesta.
 */
async function getPassengerArrivals({ staticData, stopId, directionId, userLat, userLon, walkingMinutesParam }) {
  const routes = staticData.routes_by_direction || {};
  const allStops = [
    ...(routes['0']?.stops || []),
    ...(routes['1']?.stops || [])
  ];

  const targetStop = allStops.find(s => String(s.stop_id) === String(stopId)) || allStops[0];
  if (!targetStop) return null;

  const rawArrivals = await fetchStopBoard(targetStop.target_id || '', targetStop.stop_id);
  const nowRome = getRomeTimeParts();

  // Filtra per direzione se specificata
  const filtered = directionId !== undefined && directionId !== null && directionId !== ''
    ? rawArrivals.filter(a => a.direction_id === String(directionId))
    : rawArrivals;

  // Filtra corse già passate (ETA < -1)
  const activeArrivals = filtered.filter(a => a.eta_minutes === null || a.eta_minutes >= -1);

  // Ordina per ETA crescente
  activeArrivals.sort((a, b) => {
    if (a.eta_minutes === null) return 1;
    if (b.eta_minutes === null) return -1;
    return a.eta_minutes - b.eta_minutes;
  });

  // Calcolo tempo a piedi reale
  let walkingMinutes = 1;
  let distanceMeters = 0;
  if (walkingMinutesParam !== undefined && walkingMinutesParam !== null && !isNaN(parseFloat(walkingMinutesParam))) {
    walkingMinutes = Math.max(1, Math.round(parseFloat(walkingMinutesParam)));
  } else if (userLat && userLon) {
    distanceMeters = haversineMeters(parseFloat(userLat), parseFloat(userLon), targetStop.lat, targetStop.lon);
    // Velocità pedonale media urbana: 80 metri/min (~4.8 km/h)
    walkingMinutes = Math.max(1, Math.ceil(distanceMeters / 80));
  }

  const enrichedArrivals = activeArrivals.map(arr => {
    const canCatch = arr.eta_minutes !== null ? arr.eta_minutes >= walkingMinutes : true;
    const marginMinutes = arr.eta_minutes !== null ? arr.eta_minutes - walkingMinutes : 0;

    return {
      ...arr,
      walking_minutes: walkingMinutes,
      can_catch: canCatch,
      margin_minutes: marginMinutes
    };
  });

  return {
    stop: {
      stop_id: targetStop.stop_id,
      target_id: targetStop.target_id,
      stop_name: targetStop.stop_name,
      lat: targetStop.lat,
      lon: targetStop.lon
    },
    walking_info: {
      walking_minutes: walkingMinutes,
      distance_meters: distanceMeters
    },
    current_time_rome: nowRome.timeString,
    arrivals: enrichedArrivals
  };
}

module.exports = {
  getRomeTimeParts,
  fetchStopBoard,
  fetchTripPercorso,
  getRealLiveBuses,
  getPassengerArrivals
};
```

### 7. `public/index.html`
```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>Linea 6 Cesena Live • Start Romagna</title>
  <meta name="description" content="Arrivi e posizione in tempo reale dei bus della Linea 6 di Cesena (Start Romagna)." />

  <!-- PWA & iOS Safari Mobile Web App a tutto schermo -->
  <meta name="theme-color" content="#E30613" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Linea 6" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <link rel="manifest" href="/manifest.json" />

  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Google Font: Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <!-- Leaflet 1.9.4 CSS & JS -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>

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
      background: #f1f5f9;
      user-select: none;
    }

    #map {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
    }

    /* Stile pulito tile mappa */
    .leaflet-tile {
      filter: saturate(0.85) contrast(0.98) brightness(1.02);
    }

    /* Marker Autobus Reale */
    .bus-marker-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -50%);
      pointer-events: auto;
    }
    .bus-badge {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #E30613;
      color: #ffffff;
      font-weight: 900;
      font-size: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(227, 6, 19, 0.45), 0 0 0 3px #ffffff;
      position: relative;
    }
    .bus-arrow {
      position: absolute;
      top: -6px;
      left: 50%;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 7px solid #E30613;
      transform: translateX(-50%);
    }
    .bus-label {
      margin-top: 3px;
      background: rgba(15, 23, 42, 0.9);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }

    /* Marker Fermata Selezionata */
    .stop-selected-pulse {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #E30613;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(227, 6, 19, 0.35);
      animation: pulseStop 2s infinite;
    }
    @keyframes pulseStop {
      0% { box-shadow: 0 0 0 2px rgba(227, 6, 19, 0.5); }
      70% { box-shadow: 0 0 0 9px rgba(227, 6, 19, 0); }
      100% { box-shadow: 0 0 0 2px rgba(227, 6, 19, 0); }
    }

    /* Punto Blu Utente */
    .user-dot-wrap {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #2563EB;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.3);
    }

    /* Bottom Sheet per iPhone */
    #bottomSheet {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-width: 480px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      border-top-left-radius: 28px;
      border-top-right-radius: 28px;
      box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.15);
      z-index: 1000;
      transition: max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s ease;
      max-height: 48vh;
      display: flex;
      flex-direction: column;
    }
    #bottomSheet.collapsed {
      max-height: 84px !important;
    }
    #bottomSheetContent {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-800 antialiased">

  <!-- Mappa a tutto schermo (55-60% visibile in alto) -->
  <div id="map"></div>

  <!-- Pulsanti Mappa Floating -->
  <div class="fixed top-4 right-4 z-[500] flex flex-col gap-2.5">
    <!-- Centra GPS Utente -->
    <button id="btnLocate" title="Mia Posizione" class="w-12 h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition hover:bg-slate-50">
      <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.071-7.071l-1.414 1.414M8.343 15.657l-1.414 1.414m0-11.314l1.414 1.414m7.314 7.314l1.414 1.414M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
    <!-- Inquadra Bus in circolazione -->
    <button id="btnFitBuses" title="Inquadra Autobus" class="w-12 h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition hover:bg-slate-50">
      <svg class="w-6 h-6 text-[#E30613]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h8m-8 4h8m-9 8h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v11a2 2 0 002 2zm1-2a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    </button>
  </div>

  <!-- Bottom Sheet Transit iOS Safari Mobile-First -->
  <aside id="bottomSheet" class="p-4 pb-6 border-t border-slate-100">
    <!-- Maniglia Sticky (Cliccabile per aprire/chiudere) -->
    <div id="sheetHandle" class="w-full flex flex-col items-center cursor-pointer select-none pb-2 shrink-0">
      <div class="w-11 h-1.5 bg-slate-300 rounded-full mb-1.5"></div>
      <!-- Barra di sintesi visibile quando la card è chiusa -->
      <div id="collapsedSummary" class="hidden w-full flex items-center justify-between px-1 text-xs">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-lg bg-[#E30613] text-white font-extrabold flex items-center justify-center text-xs">6</span>
          <span id="collapsedStopText" class="font-bold text-slate-800 truncate max-w-[200px]">Caricamento...</span>
        </div>
        <span id="collapsedEtaText" class="font-extrabold text-[#E30613] text-sm">--</span>
      </div>
    </div>

    <!-- Contenuto scrollabile del Bottom Sheet -->
    <div id="bottomSheetContent" class="space-y-3.5 pr-0.5">

      <!-- 1. SELETTORE DIREZIONE (2 Tab Grandi e Chiare) -->
      <div class="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
        <button id="tabDir0" class="py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-[#E30613] text-white shadow-sm">
          <span>➔ Montefiore</span>
        </button>
        <button id="tabDir1" class="py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900">
          <span>➔ Rio Maggiore</span>
        </button>
      </div>

      <!-- 2. SELETTORE FERMATA (Select Grande) -->
      <div>
        <label for="stopSelect" class="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 ml-1">Fermata di salita</label>
        <div class="relative">
          <select id="stopSelect" class="w-full py-3 pl-3.5 pr-10 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#E30613] appearance-none cursor-pointer">
            <option value="">Caricamento fermate...</option>
          </select>
          <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      <!-- 3. HERO CARD: PROSSIMO 6 REALE -->
      <div id="heroCard" class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-4 shadow-xl border border-slate-700/50">
        <!-- Header Hero -->
        <div class="flex items-center justify-between pb-2 border-b border-slate-700/60 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="font-bold tracking-wide text-slate-300">TEMPO REALE START</span>
          </div>
          <span id="heroVehicleBadge" class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-700 text-slate-200">
            Bus --
          </span>
        </div>

        <!-- Orario e Minuti in Grande -->
        <div class="py-3 flex items-baseline justify-between">
          <div>
            <div id="heroEtaBig" class="text-3xl font-black tracking-tight text-white">
              --
            </div>
            <div id="heroTimesLine" class="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
              <span>Previsto: --:--</span>
            </div>
          </div>
          <!-- Badge Cammino -->
          <div id="heroWalkBadge" class="text-right">
            <span class="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              🟢 Ce la fai a piedi
            </span>
          </div>
        </div>

        <!-- Sezione Prossime Corse Compatta -->
        <div class="pt-2 border-t border-slate-700/60">
          <div class="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Corse successive oggi</div>
          <div id="upcomingTripsList" class="space-y-1.5 text-xs">
            <div class="text-slate-400 text-[11px] py-1">Nessun'altra corsa in programma.</div>
          </div>
        </div>
      </div>

    </div>
  </aside>

  <script>
    (() => {
      'use strict';

      // Stato globale dell'applicazione
      const state = {
        map: null,
        direction: '0', // '0' = Montefiore, '1' = Rio Maggiore
        selectedStopId: '6721', // Default Quasimodo (Campus Cesena)
        staticData: null,
        liveBuses: [],
        arrivalsData: null,
        userPos: null,
        userMarker: null,
        userWalkLine: null,
        stopMarkers: new Map(),
        busMarkers: new Map(),
        pollTimer: null,
        isCollapsed: false
      };

      /* ========================================================================
         1. INIZIALIZZAZIONE MAPPA LEAFLET
         ======================================================================== */
      function initMap() {
        // Centro predefinito Cesena (Campus / Quasimodo)
        const DEFAULT_CENTER = [44.1450, 12.2380];
        state.map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView(DEFAULT_CENTER, 14);

        // OpenStreetMap Tile Layer pulito
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          crossOrigin: true
        }).addTo(state.map);

        // Gruppi di livelli
        state.stopsGroup = L.layerGroup().addTo(state.map);
        state.busesGroup = L.layerGroup().addTo(state.map);

        // Geolocation browser / iPhone
        initUserLocation();
      }

      /* ========================================================================
         2. LOCALIZZAZIONE UTENTE
         ======================================================================== */
      function initUserLocation() {
        if (!('geolocation' in navigator)) return;

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            // Se accuratezza > 400m (tipico IP desktop o proxy), non forzare posizione fasulla
            if (accuracy <= 400) {
              updateUserLocation(latitude, longitude);
              autoSelectNearestStop(latitude, longitude);
            }
          },
          (err) => console.log('Geolocalizzazione non attiva o negata:', err.message),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      }

      function updateUserLocation(lat, lon) {
        state.userPos = { lat, lon };

        if (!state.userMarker) {
          const userIcon = L.divIcon({
            className: 'user-dot-container',
            html: '<div class="user-dot-wrap"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          state.userMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(state.map);
        } else {
          state.userMarker.setLatLng([lat, lon]);
        }

        updateWalkPathToSelectedStop();
      }

      function autoSelectNearestStop(userLat, userLon) {
        if (!state.staticData) return;
        const currentStops = state.staticData.routes_by_direction?.[state.direction]?.stops || [];
        if (!currentStops.length) return;

        let closest = currentStops[0];
        let minDist = Infinity;
        for (const s of currentStops) {
          const d = Math.hypot(s.lat - userLat, s.lon - userLon);
          if (d < minDist) {
            minDist = d;
            closest = s;
          }
        }

        if (closest && closest.stop_id !== state.selectedStopId) {
          state.selectedStopId = closest.stop_id;
          const sel = document.getElementById('stopSelect');
          if (sel) sel.value = closest.stop_id;
          renderStopsOnMap();
          fetchArrivalsForStop();
        }
      }

      function updateWalkPathToSelectedStop() {
        if (state.userWalkLine) {
          state.map.removeLayer(state.userWalkLine);
          state.userWalkLine = null;
        }

        if (!state.userPos || !state.selectedStopId || !state.staticData) return;
        const currentStops = state.staticData.routes_by_direction?.[state.direction]?.stops || [];
        const stop = currentStops.find(s => String(s.stop_id) === String(state.selectedStopId));
        if (!stop) return;

        // Tratteggio pedonale discreto
        state.userWalkLine = L.polyline([[state.userPos.lat, state.userPos.lon], [stop.lat, stop.lon]], {
          color: '#2563EB',
          weight: 3,
          dashArray: '5, 8',
          opacity: 0.7
        }).addTo(state.map);
      }

      /* ========================================================================
         3. CARICAMENTO DATI STATICI DA API
         ======================================================================== */
      async function loadStaticStops() {
        try {
          const res = await fetch('/api/linea6/static');
          const data = await res.json();
          state.staticData = data;

          renderStopSelectOptions();
          renderStopsOnMap();
          fetchArrivalsForStop();
          fetchLiveBuses();
        } catch (err) {
          console.error('Errore caricamento dati statici:', err);
        }
      }

      function renderStopSelectOptions() {
        const sel = document.getElementById('stopSelect');
        if (!sel || !state.staticData) return;

        const stops = state.staticData.routes_by_direction?.[state.direction]?.stops || [];
        sel.innerHTML = stops.map(s => `
          <option value="${s.stop_id}" ${String(s.stop_id) === String(state.selectedStopId) ? 'selected' : ''}>
            ${s.stop_name} (#${s.stop_id})
          </option>
        `).join('');

        // Se la fermata precedentemente selezionata non esiste in questa direzione, prendi la prima
        if (!stops.some(s => String(s.stop_id) === String(state.selectedStopId)) && stops.length > 0) {
          state.selectedStopId = stops[0].stop_id;
          sel.value = stops[0].stop_id;
        }

        updateCollapsedSummary();
      }

      /* ========================================================================
         4. DISEGNO FERMATE SULLA MAPPA (ZERO LINEE AZZURRE PRETRACCIATE)
         ======================================================================== */
      function renderStopsOnMap() {
        state.stopsGroup.clearLayers();
        if (!state.staticData) return;

        const stops = state.staticData.routes_by_direction?.[state.direction]?.stops || [];
        stops.forEach(s => {
          const isSelected = String(s.stop_id) === String(state.selectedStopId);

          if (isSelected) {
            const stopIcon = L.divIcon({
              className: 'stop-selected-container',
              html: '<div class="stop-selected-pulse"></div>',
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            });
            const marker = L.marker([s.lat, s.lon], { icon: stopIcon, zIndexOffset: 500 });
            marker.on('click', () => selectStop(s.stop_id));
            marker.addTo(state.stopsGroup);
          } else {
            // Cerchietto bianco discreto
            const circle = L.circleMarker([s.lat, s.lon], {
              radius: 5,
              fillColor: '#ffffff',
              color: '#475569',
              weight: 2,
              fillOpacity: 1
            });
            circle.bindTooltip(`${s.stop_name}`, { direction: 'top', offset: [0, -6] });
            circle.on('click', () => selectStop(s.stop_id));
            circle.addTo(state.stopsGroup);
          }
        });

        updateWalkPathToSelectedStop();
      }

      function selectStop(stopId) {
        state.selectedStopId = String(stopId);
        const sel = document.getElementById('stopSelect');
        if (sel) sel.value = stopId;
        renderStopsOnMap();
        fetchArrivalsForStop();
      }

      /* ========================================================================
         5. FETCH ARRIVI IN TEMPO REALE (/api/linea6/arrivals)
         ======================================================================== */
      async function fetchArrivalsForStop() {
        if (!state.selectedStopId) return;

        let url = `/api/linea6/arrivals?stop_id=${state.selectedStopId}&direction=${state.direction}`;
        if (state.userPos) {
          url += `&user_lat=${state.userPos.lat}&user_lon=${state.userPos.lon}`;
        }

        try {
          const res = await fetch(url);
          const data = await res.json();
          state.arrivalsData = data;
          updateHeroArrivalUI(data);
        } catch (err) {
          console.error('Errore fetch arrivals:', err);
        }
      }

      function updateHeroArrivalUI(data) {
        const arrivals = data?.arrivals || [];
        const heroEta = document.getElementById('heroEtaBig');
        const heroTimes = document.getElementById('heroTimesLine');
        const heroVehicle = document.getElementById('heroVehicleBadge');
        const heroWalk = document.getElementById('heroWalkBadge');
        const upcomingList = document.getElementById('upcomingTripsList');

        updateCollapsedSummary();

        if (!arrivals.length) {
          // ZERO SIMULATORI: Messaggio onesto
          heroEta.textContent = 'Nessun bus';
          heroTimes.innerHTML = `<span class="text-amber-300 font-semibold">Nessun autobus Linea 6 in arrivo al momento</span>`;
          heroVehicle.textContent = 'Fuori servizio';
          heroWalk.innerHTML = `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-700 text-slate-300">Servizio 06:00 - 20:30</span>`;
          upcomingList.innerHTML = `<div class="text-slate-400 text-xs py-1">Nessuna corsa attiva programmata nelle prossime ore.</div>`;
          return;
        }

        // Prima corsa in arrivo
        const first = arrivals[0];
        const isCancelled = first.is_cancelled;
        const eta = first.eta_minutes;

        // Matricola Bus
        heroVehicle.textContent = first.vehicle_id ? `Bus #${first.vehicle_id}` : `Corsa ${first.trip_id}`;

        if (isCancelled) {
          heroEta.textContent = 'SOPPRESSA';
          heroEta.className = 'text-2xl font-black text-rose-400 tracking-tight';
          heroTimes.innerHTML = `<span class="text-rose-300 font-bold">⚠️ Corsa ${first.scheduled_time} annullata</span>`;
        } else if (eta <= 0) {
          heroEta.textContent = 'In arrivo';
          heroEta.className = 'text-3xl font-black text-emerald-400 tracking-tight animate-pulse';
          heroTimes.innerHTML = `<span>Orario: <strong class="text-white">${first.live_time}</strong></span>`;
        } else {
          heroEta.textContent = `tra ${eta} min`;
          heroEta.className = 'text-3xl font-black text-white tracking-tight';

          let timeHtml = `<span>Arrivo: <strong class="text-white">${first.live_time}</strong></span>`;
          if (first.delay_minutes > 1) {
            timeHtml += ` <span class="text-rose-400 font-bold ml-1">+${first.delay_minutes} min</span>`;
          } else if (first.delay_minutes < -1) {
            timeHtml += ` <span class="text-emerald-400 font-bold ml-1">${first.delay_minutes} min</span>`;
          }
          heroTimes.innerHTML = timeHtml;
        }

        // Stato cammino passeggero
        const walkMin = first.walking_minutes || 1;
        if (first.can_catch) {
          heroWalk.innerHTML = `
            <span class="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              🟢 Ce la fai (${walkMin} min a piedi)
            </span>
          `;
        } else {
          heroWalk.innerHTML = `
            <span class="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              🔴 Troppo vicino (${walkMin} min a piedi)
            </span>
          `;
        }

        // Corse successive
        const subsequent = arrivals.slice(1, 4);
        if (subsequent.length > 0) {
          upcomingList.innerHTML = subsequent.map(arr => `
            <div class="flex items-center justify-between py-1 border-b border-slate-800 last:border-0 text-slate-300">
              <div class="flex items-center gap-2">
                <span class="font-bold text-white">${arr.live_time}</span>
                <span class="text-slate-400 text-[11px]">${arr.vehicle_id ? `#${arr.vehicle_id}` : ''}</span>
              </div>
              <span class="font-bold text-emerald-400 text-[11px]">
                ${arr.eta_minutes !== null ? `tra ${arr.eta_minutes} min` : arr.status_text}
              </span>
            </div>
          `).join('');
        } else {
          upcomingList.innerHTML = `<div class="text-slate-400 text-xs py-1">Nessun'altra corsa in coda.</div>`;
        }
      }

      function updateCollapsedSummary() {
        const stops = state.staticData?.routes_by_direction?.[state.direction]?.stops || [];
        const stop = stops.find(s => String(s.stop_id) === String(state.selectedStopId));
        const stopName = stop ? stop.stop_name : 'Fermata';

        const collapsedStop = document.getElementById('collapsedStopText');
        const collapsedEta = document.getElementById('collapsedEtaText');
        if (collapsedStop) collapsedStop.textContent = stopName;

        const first = state.arrivalsData?.arrivals?.[0];
        if (collapsedEta) {
          if (!first) collapsedEta.textContent = 'Nessun bus';
          else if (first.is_cancelled) collapsedEta.textContent = 'SOPP';
          else if (first.eta_minutes <= 0) collapsedEta.textContent = 'In arrivo';
          else collapsedEta.textContent = `${first.eta_minutes} min`;
        }
      }

      /* ========================================================================
         6. FETCH E RENDERING AUTOBUS REALI (/api/linea6/live)
         ======================================================================== */
      async function fetchLiveBuses() {
        try {
          const res = await fetch('/api/linea6/live');
          const data = await res.json();
          state.liveBuses = data?.buses || [];
          renderLiveBusesOnMap(state.liveBuses);
        } catch (err) {
          console.error('Errore fetch live buses:', err);
        }
      }

      function renderLiveBusesOnMap(buses) {
        // Rimuovi bus che non sono più attivi
        const activeIds = new Set(buses.map(b => b.id));
        for (const [id, marker] of state.busMarkers.entries()) {
          if (!activeIds.has(id)) {
            state.busesGroup.removeLayer(marker);
            state.busMarkers.delete(id);
          }
        }

        // Disegna o aggiorna ogni autobus reale
        buses.forEach(b => {
          const isCurrentDir = b.direction_id === state.direction;
          const bgCol = isCurrentDir ? '#E30613' : '#334155';
          const vehicleText = b.vehicle_id && b.vehicle_id !== 'N.D.' ? `#${b.vehicle_id}` : '';
          const rotAngle = b.bearing || 0;

          const html = `
            <div class="bus-marker-wrap">
              <div class="bus-badge" style="background: ${bgCol};">
                <div class="bus-arrow" style="transform: translateX(-50%) rotate(${rotAngle}deg); border-bottom-color: ${bgCol};"></div>
                <span>6</span>
              </div>
              <div class="bus-label">Bus ${vehicleText}</div>
            </div>
          `;

          const busIcon = L.divIcon({
            className: 'bus-marker-container',
            html: html,
            iconSize: [44, 48],
            iconAnchor: [22, 24]
          });

          if (!state.busMarkers.has(b.id)) {
            const marker = L.marker([b.lat, b.lon], { icon: busIcon, zIndexOffset: 800 }).addTo(state.busesGroup);
            marker.bindPopup(`
              <div class="p-2 text-xs">
                <div class="font-extrabold text-sm text-[#E30613] mb-1">Linea 6 • ${b.destination}</div>
                <div>Matricola: <strong>${b.vehicle_id}</strong></div>
                <div>Stato: <strong>${b.status_text || b.status}</strong></div>
                <div class="text-[11px] text-slate-500 mt-1">Tra: ${b.current_stop?.stop_name} ➔ ${b.next_stop?.stop_name}</div>
              </div>
            `);
            state.busMarkers.set(b.id, marker);
          } else {
            const existing = state.busMarkers.get(b.id);
            existing.setLatLng([b.lat, b.lon]);
            existing.setIcon(busIcon);
          }
        });
      }

      function fitBusesOnMap() {
        if (!state.liveBuses.length) {
          // Se non ci sono bus, centra sulle fermate della direzione corrente
          const stops = state.staticData?.routes_by_direction?.[state.direction]?.stops || [];
          if (stops.length) {
            const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lon]));
            state.map.fitBounds(bounds, { padding: [40, 40] });
          }
          return;
        }

        const latlngs = state.liveBuses.map(b => [b.lat, b.lon]);
        if (state.selectedStopId && state.staticData) {
          const stops = state.staticData.routes_by_direction?.[state.direction]?.stops || [];
          const s = stops.find(st => String(st.stop_id) === String(state.selectedStopId));
          if (s) latlngs.push([s.lat, s.lon]);
        }

        state.map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 16 });
      }

      /* ========================================================================
         7. EVENTI UI & GESTIONE BOTTOM SHEET
         ======================================================================== */
      function bindEvents() {
        // Toggle tab direzione
        const tab0 = document.getElementById('tabDir0');
        const tab1 = document.getElementById('tabDir1');

        tab0?.addEventListener('click', () => {
          if (state.direction === '0') return;
          state.direction = '0';
          tab0.className = 'py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-[#E30613] text-white shadow-sm';
          tab1.className = 'py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900';
          renderStopSelectOptions();
          renderStopsOnMap();
          fetchArrivalsForStop();
          renderLiveBusesOnMap(state.liveBuses);
        });

        tab1?.addEventListener('click', () => {
          if (state.direction === '1') return;
          state.direction = '1';
          tab1.className = 'py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 bg-[#E30613] text-white shadow-sm';
          tab0.className = 'py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900';
          renderStopSelectOptions();
          renderStopsOnMap();
          fetchArrivalsForStop();
          renderLiveBusesOnMap(state.liveBuses);
        });

        // Cambio fermata dal select
        document.getElementById('stopSelect')?.addEventListener('change', (e) => {
          selectStop(e.target.value);
        });

        // Click maniglia per collassare/espandere bottom sheet
        const sheet = document.getElementById('bottomSheet');
        const handle = document.getElementById('sheetHandle');
        const collapsedSummary = document.getElementById('collapsedSummary');

        handle?.addEventListener('click', () => {
          state.isCollapsed = !state.isCollapsed;
          if (state.isCollapsed) {
            sheet.classList.add('collapsed');
            collapsedSummary.classList.remove('hidden');
          } else {
            sheet.classList.remove('collapsed');
            collapsedSummary.classList.add('hidden');
          }
        });

        // Pulsante Mia Posizione
        document.getElementById('btnLocate')?.addEventListener('click', () => {
          if (state.userPos) {
            state.map.flyTo([state.userPos.lat, state.userPos.lon], 16, { duration: 0.6 });
          } else {
            initUserLocation();
          }
        });

        // Pulsante Inquadra Bus
        document.getElementById('btnFitBuses')?.addEventListener('click', fitBusesOnMap);
      }

      /* ========================================================================
         8. AVVIO APPLICAZIONE
         ======================================================================== */
      window.addEventListener('DOMContentLoaded', () => {
        initMap();
        bindEvents();
        loadStaticStops();

        // Polling automatico dati reali ogni 20 secondi
        state.pollTimer = setInterval(() => {
          fetchLiveBuses();
          fetchArrivalsForStop();
        }, 20000);
      });
    })();
  </script>
</body>
</html>
```

---
*Bundle generato per l'analisi e il potenziamento con Google Gemini.*
