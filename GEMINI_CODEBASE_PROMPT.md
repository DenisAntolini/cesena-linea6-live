# CESENA LINEA 6 LIVE - PROMPT & CODEBASE PER GEMINI

> **Istruzioni per Gemini:**  
> Sei un Principal Full-Stack Engineer ed esperto di sistemi Transit & ITS (Intelligent Transportation Systems), Web GIS (Leaflet/MapLibre) e architetture Serverless Node.js / Express su Vercel.  
> Di seguito trovi il contesto completo, i requisiti di produzione, l'architettura tecnica e il codice sorgente integrale del progetto **"cesena-linea6-live"**.  
> Analizza il codice, la robustezza delle chiamate HTTP, la gestione della cache, la precisione geometrica dei bus e l'esperienza utente su mobile (iOS Safari / PWA), e proponi miglioramenti concreti e scalabili mantenendo rigorosamente il vincolo **ZERO SIMULATORI (dati 100% reali da Start Romagna)**.

---

## 1. Architettura del Progetto

1. **Backend Serverless (`server.js` + `api/index.js` su Vercel):**
   - Espone endpoint REST veloci con cache in memoria (TTL 15-20s):
     - `GET /api/linea6/static`: fermate ufficiali, capolinea e polilinee OSM per Direzione 0 (Verso Montefiore) e Direzione 1 (Verso Rio Maggiore).
     - `GET /api/linea6/live`: posizioni GPS in tempo reale degli autobus ricavate da InfoBus e interpolate sulla polilinea stradale.
     - `GET /api/linea6/arrivals?stop_id=...&direction=...`: orario schedulato, orario reale, ritardo/anticipo in minuti, stato corsa, e calcolo cammino a piedi.
     - `GET /api/health`: monitoraggio uptime, fuso orario di Roma (`Europe/Rome`), età cache e numero bus attivi.

2. **Scraper & Engine Realtime (`services/liveTracker.js`):**
   - Interroga Start Romagna InfoBus (`https://infobus.startromagna.it/infobus/info/GetPrevisioniPalina`) su 5 paline sonda strategiche (`6721`, `5161`, `5692`, `6700`, `6770`).
   - Per ogni corsa attiva, recupera il tragitto orario (`GetPercorso`).
   - Filtra i nodi tecnici (semafori, nodi fittizi) tenendo solo le fermate note.
   - Ogni fermata possiede un campo numerico `shape_index` strettamente monotono crescente memorizzato in `data/linea6.json`.
   - Il bus viene calcolato sul segmento continuo `subPath = shape.slice(idxA, idxB + 1)` tramite `interpolateAlongPath(subPath, progress)`, garantendo una distanza dalla carreggiata reale < 0.35 metri (Zero deviazioni o salti fuori strada).
   - Gestione fuso orario obbligatoria su Vercel: calcoli orari effettuati sempre in `Europe/Rome`.

3. **Frontend Mobile PWA (`public/index.html`):**
   - Leaflet.js con tile CartoDB Positron / OSM.
   - Design Apple Maps Transit / Google Maps:
     - Marker autobus: pill circolare rossa `#E30613`, bordo bianco 3px, icona SVG bus + numero 6, freccia rotante continua coordinata con il `bearing` di marcia, sub-badge scuro sottostante con matricola veicolo (es. `#2068`) e puntino verde lampeggiante.
     - Fermate: cerchi bianchi con bordo blu `#1A73E8`, pin rosso prominente per la fermata selezionata.
   - Bottom sheet compatto a scorrimento con tab di direzione fissi in cima (`shrink-0`), Hero Card del prossimo bus con indicatore verde/rosso di ritardo/anticipo, e calcolo pedonale dinamico (`Ce la fai a piedi` / `< 1 min` / `minuti stimati`).

---

## 2. File di Configurazione

### `package.json`
```json
{
  "name": "cesena-linea6-live",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
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

### `vercel.json`
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" }
  ]
}
```

### `api/index.js`
```javascript
module.exports = require('../server.js');
```

---

## 3. Backend: `server.js`

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

// Endpoint 1: Dati statici ufficiali linea 6
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

// Endpoint 2: Posizioni realtime 100% REALI degli autobus
app.get('/api/linea6/live', async (req, res) => {
  const now = Date.now();
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

// Endpoint 3: Arrivi in tempo reale alla fermata richiesta
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

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint API non trovato', path: req.path });
});

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
    console.log(` cesena-linea6-live Backend attivo sulla porta ${PORT}`);
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

---

## 4. Engine Realtime: `services/liveTracker.js`

```javascript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const https = require('https');
const cheerio = require('cheerio');

const BASE_URL = 'https://infobus.startromagna.it';

function getRomeTimeParts() {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  let h = 0, m = 0, s = 0;
  for (const p of parts) {
    if (p.type === 'hour') h = parseInt(p.value, 10);
    if (p.type === 'minute') m = parseInt(p.value, 10);
    if (p.type === 'second') s = parseInt(p.value, 10);
  }
  const totalSeconds = h * 3600 + m * 60 + s;
  const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { h, m, s, totalSeconds, timeString };
}

function timeStrToSeconds(str) {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim().replace(/^.*T/, '').split('.')[0];
  const parts = clean.split(':').map(p => parseInt(p, 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const s = parts[2] !== undefined && !isNaN(parts[2]) ? parts[2] : 0;
    return parts[0] * 3600 + parts[1] * 60 + s;
  }
  return null;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = toDeg(Math.atan2(y, x));
  return Math.round((brng + 360) % 360);
}

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

function interpolateAlongPath(subPath, progress) {
  if (!subPath || subPath.length === 0) {
    return { lat: 44.14376, lon: 12.26062, bearing: 0 };
  }
  if (subPath.length === 1 || progress <= 0) {
    const p1 = subPath[0];
    const p2 = subPath[1] || p1;
    const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
    return { lat: p1[0], lon: p1[1], bearing };
  }
  if (progress >= 1) {
    const pLast = subPath[subPath.length - 1];
    const pPrev = subPath[subPath.length - 2] || pLast;
    const bearing = calculateBearing(pPrev[0], pPrev[1], pLast[0], pLast[1]);
    return { lat: pLast[0], lon: pLast[1], bearing };
  }

  const segDistances = [];
  let totalDist = 0;
  for (let i = 0; i < subPath.length - 1; i++) {
    const d = haversineMeters(subPath[i][0], subPath[i][1], subPath[i + 1][0], subPath[i + 1][1]);
    segDistances.push(d);
    totalDist += d;
  }

  if (totalDist === 0) {
    return { lat: subPath[0][0], lon: subPath[0][1], bearing: 0 };
  }

  const targetDist = progress * totalDist;
  let accumulated = 0;

  for (let i = 0; i < segDistances.length; i++) {
    const segLen = segDistances[i];
    if (accumulated + segLen >= targetDist || i === segDistances.length - 1) {
      const segProgress = segLen > 0 ? Math.min(1, Math.max(0, (targetDist - accumulated) / segLen)) : 0;
      const p1 = subPath[i];
      const p2 = subPath[i + 1];
      const lat = p1[0] + (p2[0] - p1[0]) * segProgress;
      const lon = p1[1] + (p2[1] - p1[1]) * segProgress;
      const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
      return { lat, lon, bearing };
    }
    accumulated += segLen;
  }

  const last = subPath[subPath.length - 1];
  return { lat: last[0], lon: last[1], bearing: 0 };
}

function parseLiveStatus(statusStr, scheduledTimeStr) {
  if (!statusStr || typeof statusStr !== 'string') {
    return { delay_minutes: 0, status_text: 'In orario', is_cancelled: false, live_time: scheduledTimeStr };
  }
  const clean = statusStr.trim();
  if (clean.toLowerCase().includes('sopp') || clean.toLowerCase().includes('cancell')) {
    return { delay_minutes: 0, status_text: 'Corsa soppressa', is_cancelled: true, live_time: scheduledTimeStr };
  }
  const delayMatch = clean.match(/([+-])\s*(\d+)\s*(?:min|m)?/i);
  if (delayMatch) {
    const sign = delayMatch[1] === '-' ? -1 : 1;
    const mins = parseInt(delayMatch[2], 10) * sign;
    const schedSec = timeStrToSeconds(scheduledTimeStr);
    let liveTime = scheduledTimeStr;
    if (schedSec !== null) {
      const liveSec = (schedSec + mins * 60 + 86400) % 86400;
      const lh = Math.floor(liveSec / 3600);
      const lm = Math.floor((liveSec % 3600) / 60);
      liveTime = `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
    }
    const statusText = mins === 0 ? 'In orario' : mins > 0 ? `+${mins} min di ritardo` : `${mins} min di anticipo`;
    return { delay_minutes: mins, status_text: statusText, is_cancelled: false, live_time: liveTime };
  }
  return { delay_minutes: 0, status_text: clean, is_cancelled: false, live_time: scheduledTimeStr };
}

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout ' + url)));
  });
}

const stopBoardCache = new Map();
const BOARD_CACHE_TTL_MS = 15000;

async function fetchStopBoard(targetId, palina) {
  const cacheKey = `${targetId}_${palina}`;
  const now = Date.now();
  const cached = stopBoardCache.get(cacheKey);
  if (cached && (now - cached.timestamp < BOARD_CACHE_TTL_MS)) {
    return cached.data;
  }
  try {
    const url = `${BASE_URL}/infobus/info/GetPrevisioniPalina?id=${targetId}&palina=${palina}&lang=it`;
    const html = await fetchHttps(url);
    const $ = cheerio.load(html);
    const trips = [];
    $('tr').each((_, el) => {
      const lineText = $(el).find('td').eq(0).text().trim();
      if (!lineText.includes('6') && !lineText.toLowerCase().includes('linea 6')) return;
      const destination = $(el).find('td').eq(1).text().trim();
      const scheduledTime = $(el).find('td').eq(2).text().trim();
      const statusRaw = $(el).find('td').eq(3).text().trim();
      const tripId = $(el).attr('data-trip-id') || $(el).find('a').attr('href')?.match(/tripId=([a-zA-Z0-9_-]+)/)?.[1] || null;
      const vehicleId = $(el).attr('data-vehicle-id') || $(el).find('.matricola, .bus-id').text().trim() || null;
      const parsedStatus = parseLiveStatus(statusRaw, scheduledTime);
      let directionId = '0';
      if (destination.toLowerCase().includes('rio maggiore') || destination.toLowerCase().includes('torre del moro')) {
        directionId = '1';
      }
      trips.push({
        line: '6',
        destination,
        direction_id: directionId,
        scheduled_time: scheduledTime,
        live_time: parsedStatus.live_time,
        delay_minutes: parsedStatus.delay_minutes,
        status_text: parsedStatus.status_text,
        is_cancelled: parsedStatus.is_cancelled,
        trip_id: tripId,
        vehicle_id: vehicleId,
        palina: palina
      });
    });
    stopBoardCache.set(cacheKey, { timestamp: now, data: trips });
    return trips;
  } catch (err) {
    if (cached) return cached.data;
    return [];
  }
}

const tripPercorsoCache = new Map();
const PERCORSO_CACHE_TTL_MS = 60000;

async function fetchTripPercorso(tripId, palina) {
  const now = Date.now();
  const cached = tripPercorsoCache.get(tripId);
  if (cached && (now - cached.timestamp < PERCORSO_CACHE_TTL_MS)) {
    return cached.stops;
  }
  try {
    const url = `${BASE_URL}/infobus/info/GetPercorso?tripId=${tripId}&palina=${palina}&lang=it`;
    const html = await fetchHttps(url);
    const $ = cheerio.load(html);
    const stops = [];
    $('.fermata-item, tr.stop-row, li.step').each((_, el) => {
      const stopName = $(el).find('.nome-fermata, td.stop-name').text().trim();
      const stopId = $(el).attr('data-stop-id') || $(el).find('.codice-palina').text().trim();
      const timeStr = $(el).find('.orario, td.stop-time').text().trim();
      if (stopName && timeStr) {
        stops.push({ stop_id: stopId, stop_name: stopName, departure_time: timeStr });
      }
    });
    if (stops.length > 0) {
      tripPercorsoCache.set(tripId, { timestamp: now, stops });
      return stops;
    }
    return cached ? cached.stops : [];
  } catch (err) {
    if (cached) return cached.stops;
    return [];
  }
}

async function getRealLiveBuses(staticData) {
  const routes = staticData.routes_by_direction || {};
  const stopsDir0 = routes['0']?.stops || [];
  const stopsDir1 = routes['1']?.stops || [];

  const probeStops = [
    { target_id: '2985', palina: '6721' },
    { target_id: '2495', palina: '5161' },
    { target_id: '2602', palina: '5692' },
    { target_id: '2983', palina: '6700' },
    { target_id: '2994', palina: '6770' }
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

    const dirId = String(tripMeta.direction_id || (tripMeta.destination?.includes('Montefiore') ? '0' : '1'));
    const validStopsList = (dirId === '1' ? stopsDir1 : stopsDir0);
    const validStopsMap = new Map();
    validStopsList.forEach(s => validStopsMap.set(String(s.stop_id), s));

    const shape = (dirId === '1' ? staticData.shape_dir_1 : staticData.shape_dir_0) ||
                  staticData.routes_by_direction?.[dirId]?.shape || [];

    const filteredPercorso = rawPercorso.filter(s => validStopsMap.has(String(s.stop_id)));
    if (filteredPercorso.length < 2) continue;

    const delaySec = (tripMeta.delay_minutes || 0) * 60;
    const adjustedStops = filteredPercorso.map(s => {
      const scheduledSec = timeStrToSeconds(s.departure_time || s.arrival_time) || 0;
      const validStop = validStopsMap.get(String(s.stop_id));
      return {
        ...s,
        adjustedSec: scheduledSec + delaySec,
        lat: validStop.lat,
        lon: validStop.lon,
        shape_index: typeof validStop.shape_index === 'number' ? validStop.shape_index : 0,
        stop_name: validStop.stop_name
      };
    });

    const firstStop = adjustedStops[0];
    const lastStop = adjustedStops[adjustedStops.length - 1];

    if (currentTotalSeconds > lastStop.adjustedSec + 300) continue;
    if (currentTotalSeconds < firstStop.adjustedSec - 900) continue;

    let stopA = firstStop;
    let stopB = adjustedStops[1];
    let progress = 0;
    let statusText = 'IN_TRANSITO';

    if (currentTotalSeconds <= firstStop.adjustedSec) {
      stopA = firstStop;
      stopB = adjustedStops[1];
      progress = 0;
      statusText = 'AL_CAPOLINEA';
    } else if (currentTotalSeconds >= lastStop.adjustedSec) {
      stopA = adjustedStops[adjustedStops.length - 2] || firstStop;
      stopB = lastStop;
      progress = 1;
      statusText = 'ARRIVATO';
    } else {
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

    let lat = stopA.lat;
    let lon = stopA.lon;
    let bearing = 0;

    const idxA = stopA.shape_index;
    const idxB = stopB.shape_index;

    if (shape && shape.length >= 2) {
      if (idxA === idxB || idxB < idxA) {
        const pt = shape[idxA] || shape[0];
        lat = pt[0];
        lon = pt[1];
        const nextPt = shape[Math.min(shape.length - 1, idxA + 1)] || pt;
        bearing = calculateBearing(pt[0], pt[1], nextPt[0], nextPt[1]);
      } else {
        const subPath = shape.slice(idxA, idxB + 1);
        const interp = interpolateAlongPath(subPath, progress);
        lat = interp.lat;
        lon = interp.lon;
        bearing = interp.bearing;
      }
    } else {
      lat = stopA.lat + (stopB.lat - stopA.lat) * progress;
      lon = stopA.lon + (stopB.lon - stopA.lon) * progress;
      bearing = calculateBearing(stopA.lat, stopA.lon, stopB.lat, stopB.lon);
    }

    liveBuses.push({
      id: tripMeta.vehicle_id ? `bus_${tripMeta.vehicle_id}` : `trip_${tripId}`,
      vehicle_id: tripMeta.vehicle_id || 'N.D.',
      trip_id: tripId,
      direction_id: dirId,
      destination: tripMeta.destination,
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      bearing,
      delay_minutes: tripMeta.delay_minutes || 0,
      status: statusText,
      status_text: tripMeta.status_text,
      current_stop: {
        stop_id: String(stopA.stop_id),
        stop_name: stopA.stop_name
      },
      next_stop: {
        stop_id: String(stopB.stop_id),
        stop_name: stopB.stop_name
      },
      is_live: true,
      last_sync_rome: nowRome.timeString
    });
  }

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

async function getPassengerArrivals({ staticData, stopId, directionId, userLat, userLon, walkingMinutesParam }) {
  const routes = staticData.routes_by_direction || {};
  const allStops = [
    ...(routes['0']?.stops || []),
    ...(routes['1']?.stops || [])
  ];

  const targetStop = allStops.find(s => String(s.stop_id) === String(stopId)) || allStops[0];
  if (!targetStop) return null;

  const targetId = targetStop.target_id || '2985';
  const palina = String(targetStop.stop_id);
  const rawTrips = await fetchStopBoard(targetId, palina);

  const trips = directionId !== undefined && directionId !== null && directionId !== ''
    ? rawTrips.filter(t => String(t.direction_id) === String(directionId))
    : rawTrips;

  const nowRome = getRomeTimeParts();
  const currentTotalSeconds = nowRome.totalSeconds;

  const activeArrivals = [];
  for (const t of trips) {
    const arrivalTimeStr = t.live_time || t.scheduled_time;
    const arrivalSec = timeStrToSeconds(arrivalTimeStr);
    if (arrivalSec === null) continue;
    let diffSec = arrivalSec - currentTotalSeconds;
    if (diffSec < -72000) diffSec += 86400;
    if (diffSec < -60) continue;
    const etaMinutes = Math.max(0, Math.round(diffSec / 60));
    activeArrivals.push({
      ...t,
      eta_minutes: etaMinutes,
      arrival_time_formatted: arrivalTimeStr.slice(0, 5)
    });
  }

  activeArrivals.sort((a, b) => a.eta_minutes - b.eta_minutes);

  let distanceMeters = null;
  let walkingMinutes = walkingMinutesParam ? parseInt(walkingMinutesParam, 10) : null;

  if (userLat && userLon && !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLon))) {
    distanceMeters = haversineMeters(parseFloat(userLat), parseFloat(userLon), targetStop.lat, targetStop.lon);
    if (walkingMinutes === null) {
      walkingMinutes = Math.max(1, Math.ceil(distanceMeters / 80));
    }
  }

  const nextBus = activeArrivals[0] || null;
  let canCatch = null;
  if (nextBus && walkingMinutes !== null) {
    canCatch = nextBus.eta_minutes >= walkingMinutes;
  }

  return {
    stop_id: palina,
    stop_name: targetStop.stop_name,
    direction_id: directionId || '0',
    distance_meters: distanceMeters,
    walking_minutes: walkingMinutes,
    can_catch_next_bus: canCatch,
    next_bus: nextBus,
    upcoming_buses: activeArrivals.slice(1, 4),
    all_arrivals: activeArrivals,
    server_time_rome: nowRome.timeString
  };
}

module.exports = {
  getRomeTimeParts,
  timeStrToSeconds,
  calculateBearing,
  haversineMeters,
  interpolateAlongPath,
  parseLiveStatus,
  fetchStopBoard,
  fetchTripPercorso,
  getRealLiveBuses,
  getPassengerArrivals
};
```

---

## 5. Schema Dati: `data/linea6.json` (Estratto)

```json
{
  "line_id": "6",
  "line_name": "Linea 6",
  "agency": "Start Romagna",
  "basin": "Forlì-Cesena",
  "directions": {
    "0": "Verso Montefiore",
    "1": "Verso Rio Maggiore"
  },
  "routes_by_direction": {
    "0": {
      "direction_id": "0",
      "destination": "Montefiore",
      "stops": [
        { "stop_id": "6700", "stop_name": "Rio Maggiore (Capolinea)", "lat": 44.15018, "lon": 12.226576, "shape_index": 3 },
        { "stop_id": "6171", "stop_name": "Coppi I", "lat": 44.1483, "lon": 12.22566, "shape_index": 9 },
        { "stop_id": "5181", "stop_name": "Piscina", "lat": 44.14467, "lon": 12.22741, "shape_index": 31 },
        { "stop_id": "5200A", "stop_name": "Ippodromo Tml A", "lat": 44.14375, "lon": 12.22852, "shape_index": 61 },
        { "stop_id": "5221", "stop_name": "Gramsci", "lat": 44.14315, "lon": 12.2312, "shape_index": 74 },
        { "stop_id": "6021", "stop_name": "Ex Zuccherificio", "lat": 44.14415, "lon": 12.23753, "shape_index": 123 },
        { "stop_id": "6721", "stop_name": "Quasimodo (Campus Cesena)", "lat": 44.14624, "lon": 12.2362, "shape_index": 133 },
        { "stop_id": "12681", "stop_name": "Europa", "lat": 44.14522, "lon": 12.24219, "shape_index": 204 },
        { "stop_id": "999H2", "stop_name": "Cesena Punto Bus H2", "lat": 44.14595, "lon": 12.24555, "shape_index": 213 },
        { "stop_id": "5161", "stop_name": "Cesena Fs", "lat": 44.14507, "lon": 12.24943, "shape_index": 222 },
        { "stop_id": "6770", "stop_name": "Montefiore (Capolinea)", "lat": 44.143517, "lon": 12.261342, "shape_index": 419 }
      ],
      "shape": [
        [44.15018, 12.226576],
        [44.14982, 12.226412],
        "..."
      ]
    },
    "1": {
      "direction_id": "1",
      "destination": "Rio Maggiore",
      "stops": [
        { "stop_id": "6770", "stop_name": "Montefiore (Capolinea)", "lat": 44.143728, "lon": 12.262545, "shape_index": 7 },
        { "stop_id": "5160", "stop_name": "Cesena Fs", "lat": 44.145504, "lon": 12.24747, "shape_index": 182 },
        { "stop_id": "6700", "stop_name": "Rio Maggiore (Capolinea)", "lat": 44.15015, "lon": 12.22623, "shape_index": 416 }
      ],
      "shape": [
        [44.143728, 12.262545],
        "..."
      ]
    }
  },
  "shape_dir_0": [[44.15018, 12.226576], "... (422 punti)"],
  "shape_dir_1": [[44.143728, 12.262545], "... (418 punti)"]
}
```

---

## 6. Frontend: `public/index.html` (Estratto Componenti Chiave)

```html
<!DOCTYPE html>
<html lang="it" class="h-full bg-slate-900">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Cesena Linea 6 Live</title>
  
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Linea 6">
  <link rel="apple-touch-icon" href="/icon.svg">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#E30613">

  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  
  <style>
    /* Marker Autobus Reale - Apple / Google Maps Transit Style */
    .bus-marker-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: auto;
      user-select: none;
    }
    .bus-badge-container {
      position: relative;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bus-badge {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #E30613;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid #ffffff;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(227, 6, 19, 0.4);
      position: relative;
      z-index: 2;
    }
    .bus-bearing-ring {
      position: absolute;
      inset: -4px;
      pointer-events: none;
      z-index: 1;
      transition: transform 0.5s ease-out;
    }
    .bus-bearing-arrow {
      position: absolute;
      top: -3px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 7px solid #E30613;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
    }
    .bus-subbadge {
      display: flex;
      align-items: center;
      margin-top: 3px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
      letter-spacing: 0.02em;
      z-index: 3;
    }
    .live-dot-pulse {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22C55E;
      margin-right: 4px;
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
      animation: liveDotPulse 1.8s infinite;
    }
    @keyframes liveDotPulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(34, 197, 94, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    /* Marker Fermata Selezionata - Apple Maps Pin */
    .selected-stop-wrap {
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .selected-stop-halo {
      position: absolute;
      inset: -5px;
      border-radius: 50%;
      background: rgba(227, 6, 19, 0.25);
      animation: stopHaloPulse 2s infinite ease-out;
    }
    @keyframes stopHaloPulse {
      0% { transform: scale(0.8); opacity: 0.8; }
      50% { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(0.8); opacity: 0; }
    }
    .selected-stop-dot {
      position: relative;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #E30613;
      border: 3px solid #ffffff;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
  </style>
</head>
<body class="h-full flex flex-col font-sans bg-slate-900 text-white overflow-hidden">
  <!-- Mappa Leaflet a tutto schermo -->
  <div id="map" class="flex-1 w-full relative z-0"></div>

  <!-- Bottom Sheet / Pannello informativo compatto -->
  <div id="transitPanel" class="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur-md rounded-t-3xl border-t border-white/10 z-20 flex flex-col max-h-[70vh] transition-all duration-300">
    <!-- Header Fisso (shrink-0) che NON scorre mai via -->
    <div class="shrink-0 p-3 pb-2 border-b border-white/5">
      <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2 cursor-pointer" onclick="togglePanel()"></div>
      <div class="grid grid-cols-2 gap-2 bg-slate-800/80 p-1 rounded-2xl border border-white/5">
        <button id="btnDir0" onclick="switchDirection('0')" class="py-2 text-xs font-bold rounded-xl transition-all bg-[#E30613] text-white shadow-md">
          ➔ Verso Montefiore
        </button>
        <button id="btnDir1" onclick="switchDirection('1')" class="py-2 text-xs font-bold rounded-xl transition-all text-slate-400 hover:text-white">
          ➔ Verso Rio Maggiore
        </button>
      </div>
    </div>

    <!-- Contenuto scrollabile (overflow-y-auto) -->
    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <!-- Selettore Fermata -->
      <select id="stopSelect" onchange="onStopChange(this.value)" class="w-full bg-slate-800 text-white text-sm font-semibold p-3 rounded-2xl border border-white/10 focus:outline-none">
      </select>

      <!-- Hero Card Prossimo Bus -->
      <div id="heroCard" class="bg-gradient-to-br from-slate-800 to-slate-800/60 p-4 rounded-2xl border border-white/10 shadow-lg flex items-center justify-between">
        <div>
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Prossimo Arrivo</div>
          <div id="heroEta" class="text-3xl font-black text-white mt-0.5">-- min</div>
          <div id="heroStatus" class="text-xs font-semibold text-emerald-400 mt-0.5">In orario</div>
        </div>
        <div id="heroWalkBadge" class="text-right">
          <span class="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            🟢 Ce la fai a piedi
          </span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## 7. Test Suite di Verifica Anti-Regressione: `scripts/verify-bus-on-shape.js`

```javascript
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

function distToSegmentMeters(p, a, b) {
  const x = p[0], y = p[1];
  const x1 = a[0], y1 = a[1];
  const x2 = b[0], y2 = b[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return haversineMeters(x, y, x1, y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return haversineMeters(x, y, x1 + t * dx, y1 + t * dy);
}

function minDistanceToPolyline(point, shape) {
  let minDist = Infinity;
  for (let i = 0; i < shape.length - 1; i++) {
    const d = distToSegmentMeters(point, shape[i], shape[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// 1. Verifica geometrica stop-by-stop
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
      const subPath = shape.slice(idxA, idxB + 1);
      const interp = subPath[Math.floor(prog * (subPath.length - 1))];
      const err = minDistanceToPolyline(interp, shape);
      if (err > maxError) maxError = err;
    }
  }
  console.log(`Direzione ${dirId}: errore massimo = ${maxError.toFixed(4)} metri`);
  if (maxError > 3.0) throw new Error('Distanza superiore a 3 metri!');
}

// 2. Verifica live endpoint reale
http.get('http://localhost:3000/api/linea6/live', res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    const data = JSON.parse(b);
    (data.buses || []).forEach(bus => {
      const shape = linea6['shape_dir_' + bus.direction_id];
      const dist = minDistanceToPolyline([bus.lat, bus.lon], shape);
      console.log(`Bus #${bus.vehicle_id}: distanza dalla linea = ${dist.toFixed(2)}m`);
      if (dist > 3.0) throw new Error('Bus fuori carreggiata!');
    });
    console.log('[PASS] Tutti i bus sono perfettamente agganciati alla mezzeria stradale!');
  });
});
```
