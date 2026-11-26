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
const STOP_BOARD_CACHE_TTL_MS = 15 * 1000; // 15 secondi per le paline
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
 * Interpola una posizione lungo un sotto-tracciato polilinea per una frazione progress (0..1).
 * Restituisce { lat, lon, bearing, segmentIndex, segProgress }.
 */
function interpolateAlongPath(subPath, progress) {
  if (!subPath || subPath.length === 0) {
    return { lat: 44.14376, lon: 12.26062, bearing: 0, segmentIndex: 0, segProgress: 0 };
  }
  if (subPath.length === 1 || progress <= 0) {
    const p1 = subPath[0];
    const p2 = subPath[1] || p1;
    const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
    return { lat: p1[0], lon: p1[1], bearing, segmentIndex: 0, segProgress: 0 };
  }
  if (progress >= 1) {
    const pLast = subPath[subPath.length - 1];
    const pPrev = subPath[subPath.length - 2] || pLast;
    const bearing = calculateBearing(pPrev[0], pPrev[1], pLast[0], pLast[1]);
    return { lat: pLast[0], lon: pLast[1], bearing, segmentIndex: subPath.length - 1, segProgress: 0 };
  }

  // Calcola lunghezze geodetiche dei segmenti
  const segDistances = [];
  let totalDist = 0;
  for (let i = 0; i < subPath.length - 1; i++) {
    const d = haversineMeters(subPath[i][0], subPath[i][1], subPath[i + 1][0], subPath[i + 1][1]);
    segDistances.push(d);
    totalDist += d;
  }

  if (totalDist === 0) {
    return { lat: subPath[0][0], lon: subPath[0][1], bearing: 0, segmentIndex: 0, segProgress: 0 };
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
      return { lat, lon, bearing, segmentIndex: i, segProgress };
    }
    accumulated += segLen;
  }

  const last = subPath[subPath.length - 1];
  return { lat: last[0], lon: last[1], bearing: 0, segmentIndex: subPath.length - 1, segProgress: 0 };
}

function findClosestVertexIndex(shape, targetLat, targetLon, fromIndex = 0) {
  let bestIdx = -1;
  let minDist = Infinity;
  for (let i = fromIndex; i < shape.length; i++) {
    const d = haversineMeters(targetLat, targetLon, shape[i][0], shape[i][1]);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
    }
  }
  return { index: bestIdx, distance: minDist };
}

/**
 * Parsing robusto dello stato live restituito da Start Romagna.
 * Gestisce: "+ 2 minuti", "- 1 minuti", "11:45", "In arrivo", "SOPP", "No Info", ecc.
 */
function parseStartRomagnaStatus(statusText, scheduledTimeStr, nowRome) {
  const schedMinutes = timeStrToMinutes(scheduledTimeStr);
  let liveMinutes = schedMinutes;
  let delayMinutes = 0;
  let statusClass = 'on-time';
  let hasRealtime = false;
  const cleanText = (statusText || '').trim();

  if (/sopp/i.test(cleanText)) {
    return {
      isCancelled: true,
      hasRealtime: true,
      statusClass: 'sopp',
      liveTimeStr: 'SOPP',
      liveMinutes: null,
      delayMinutes: 0,
      etaMinutes: null,
      displayText: 'CORSA SOPPRESSA'
    };
  }

  const delayMatch = cleanText.match(/([+-]?\s*\d+)\s*min/i);
  if (delayMatch) {
    hasRealtime = true;
    delayMinutes = parseInt(delayMatch[1].replace(/\s+/g, ''), 10) || 0;
    if (schedMinutes !== null) {
      liveMinutes = schedMinutes + delayMinutes;
    }
    if (delayMinutes > 2) statusClass = 'delayed';
    else if (delayMinutes < -1) statusClass = 'early';
  } else if (/^\d{1,2}:\d{2}$/.test(cleanText)) {
    hasRealtime = true;
    const absMin = timeStrToMinutes(cleanText);
    if (absMin !== null && schedMinutes !== null) {
      liveMinutes = absMin;
      delayMinutes = liveMinutes - schedMinutes;
    }
    if (delayMinutes > 2) statusClass = 'delayed';
  } else if (/arriv/i.test(cleanText)) {
    hasRealtime = true;
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
    isCancelled: false,
    hasRealtime,
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
    const timeoutId = setTimeout(() => controller.abort(), 4500);

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
      const directionId = destUpper.includes('MONTEFIORE')
        ? '0'
        : destUpper.includes('RIO MAGGIORE')
          ? '1'
          : (/^F_A/i.test(tripId || '') ? '0' : (/^F_R/i.test(tripId || '') ? '1' : null));

      const parsedStatus = parseStartRomagnaStatus(statusText, scheduledTime, nowRome);

      arrivals.push({
        line: '6',
        destination: destText,
        direction_id: directionId,
        scheduled_time: scheduledTime,
        live_time: parsedStatus.liveTimeStr,
        eta_minutes: parsedStatus.etaMinutes,
        delay_minutes: parsedStatus.delayMinutes,
        has_realtime: parsedStatus.hasRealtime,
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://infobus.startromagna.it/PercorsoService.asmx/GetPercorso', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ trip_id: tripId, palina: String(palina) }),
      signal: controller.signal
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Spalma gli orari identici (stesso minuto HH:MM) in modo proporzionale alla distanza stradale
 * evitando teletrasporti allo scoccare del minuto tra fermate vicine.
 */
function spreadDuplicateStopTimes(stops, shape) {
  if (!stops || stops.length < 2) return stops;
  const result = stops.map(s => ({ ...s }));

  const cumDist = [0];
  for (let i = 1; i < result.length; i++) {
    const idxA = result[i - 1].shape_index;
    const idxB = result[i].shape_index;
    let d = 0;
    if (shape && shape.length >= 2 && idxB > idxA) {
      for (let k = idxA; k < Math.min(idxB, shape.length - 1); k++) {
        d += haversineMeters(shape[k][0], shape[k][1], shape[k + 1][0], shape[k + 1][1]);
      }
    } else {
      d = haversineMeters(result[i - 1].lat, result[i - 1].lon, result[i].lat, result[i].lon);
    }
    cumDist.push(cumDist[i - 1] + Math.max(10, d));
  }

  let i = 0;
  while (i < result.length) {
    let j = i;
    while (j + 1 < result.length && result[j + 1].adjustedSec <= result[i].adjustedSec) {
      j++;
    }
    if (j > i) {
      const tStart = result[i].adjustedSec;
      const hasNext = j + 1 < result.length;
      const endIdx = hasNext ? j + 1 : j;
      const tEnd = hasNext ? result[j + 1].adjustedSec : tStart + (j - i) * 20;
      const totalSpanSec = Math.max(10, tEnd - tStart);
      const distStart = cumDist[i];
      const totalDist = Math.max(1, cumDist[endIdx] - distStart);

      for (let k = i + 1; k <= j; k++) {
        const frac = (cumDist[k] - distStart) / totalDist;
        const spreadSec = Math.round(tStart + frac * totalSpanSec);
        result[k].adjustedSec = Math.max(result[k - 1].adjustedSec + 1, spreadSec);
      }
    }
    i = j + 1;
  }

  return result;
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

  // Tutte e 7 le sonde strategiche interrogate in parallelo su entrambe le direzioni
  const probeStops = [
    { target_id: '2985', palina: '6721' }, // Quasimodo (entrambe le direzioni)
    { target_id: '2495', palina: '5161' }, // Cesena FS dir. 0
    { target_id: '2494', palina: '5160' }, // Cesena FS dir. 1
    { target_id: '2602', palina: '5692' }, // Ghirotti Ospedale dir. 0
    { target_id: '2601', palina: '5691' }, // Ghirotti Ospedale dir. 1
    { target_id: '2983', palina: '6700' }, // Rio Maggiore
    { target_id: '2994', palina: '6770' }  // Montefiore
  ];

  const boardResults = await Promise.allSettled(
    probeStops.map(p => fetchStopBoard(p.target_id, p.palina))
  );

  // Raccoglie tutte le letture per ciascun trip_id dalle 7 sonde
  const tripReadingsMap = new Map();
  for (const r of boardResults) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const item of r.value) {
      if (!item.trip_id || item.is_cancelled) continue;
      if (!tripReadingsMap.has(item.trip_id)) {
        tripReadingsMap.set(item.trip_id, []);
      }
      tripReadingsMap.get(item.trip_id).push(item);
    }
  }

  const activeTripsMap = new Map();
  for (const [tripId, readings] of tripReadingsMap.entries()) {
    const sorted = [...readings].sort((a, b) => {
      if (a.has_realtime !== b.has_realtime) return a.has_realtime ? -1 : 1;
      const etaA = a.eta_minutes !== null && a.eta_minutes >= 0 ? a.eta_minutes : Infinity;
      const etaB = b.eta_minutes !== null && b.eta_minutes >= 0 ? b.eta_minutes : Infinity;
      return etaA - etaB;
    });

    const primary = { ...sorted[0] };
    if (!primary.vehicle_id) {
      const withVeh = sorted.find(x => x.vehicle_id);
      if (withVeh) primary.vehicle_id = withVeh.vehicle_id;
    }

    // Mediana dei ritardi realtime delle sonde davanti al bus (elimina il ping-pong tra sonde)
    const rtDelays = sorted
      .filter(x => x.has_realtime && x.eta_minutes !== null && x.eta_minutes >= -1 && x.eta_minutes <= 30)
      .map(x => x.delay_minutes || 0)
      .sort((a, b) => a - b);

    if (rtDelays.length > 0) {
      const mid = Math.floor(rtDelays.length / 2);
      primary.delay_minutes = rtDelays.length % 2 === 1
        ? rtDelays[mid]
        : Math.round((rtDelays[mid - 1] + rtDelays[mid]) / 2);
    }

    activeTripsMap.set(tripId, primary);
  }

  const nowRome = getRomeTimeParts();
  const currentTotalSeconds = nowRome.totalSeconds;
  const liveBuses = [];

  // Pre-filtra corse troppo lontane (>35m) e scarica tutti i percorsi attivi in PARALLELO
  const candidateEntries = [...activeTripsMap.entries()].filter(
    ([, meta]) => meta.eta_minutes === null || meta.eta_minutes <= 35
  );
  const percorsoResults = await Promise.allSettled(
    candidateEntries.map(([tripId, meta]) => fetchTripPercorso(tripId, meta.palina || '6721'))
  );

  for (let i = 0; i < candidateEntries.length; i++) {
    const [tripId, tripMeta] = candidateEntries[i];
    const pRes = percorsoResults[i];
    if (pRes.status !== 'fulfilled' || !pRes.value || pRes.value.length < 2) continue;
    const rawPercorso = pRes.value;

    // Seleziona la direzione del bus e filtra rigorosamente le fermate su quelle note
    let resolvedDir = tripMeta.direction_id;
    if (!resolvedDir && tripId) {
      if (/^F_A/i.test(tripId)) resolvedDir = '0';
      else if (/^F_R/i.test(tripId)) resolvedDir = '1';
    }
    if (!resolvedDir && tripMeta.destination) {
      const destUp = tripMeta.destination.toUpperCase();
      if (destUp.includes('MONTEFIORE')) resolvedDir = '0';
      else if (destUp.includes('RIO MAGGIORE')) resolvedDir = '1';
    }
    const dirId = String(resolvedDir || '0');
    const validStopsList = (dirId === '1' ? stopsDir1 : stopsDir0);
    const validStopsMap = new Map();
    validStopsList.forEach(s => validStopsMap.set(String(s.stop_id), s));

    const shape = (dirId === '1' ? staticData.shape_dir_1 : staticData.shape_dir_0) ||
                  staticData.routes_by_direction?.[dirId]?.shape || [];

    // Filtra nodi tecnici (es. Semaforo-* o fermate non riconosciute) per evitare salti fuori percorso
    const filteredPercorso = rawPercorso.filter(s => validStopsMap.has(String(s.stop_id)));
    if (filteredPercorso.length < 2) continue;

    // Aggiusta gli orari di fermata con il ritardo effettivo rilevato e spalma i minuti identici
    const delaySec = (tripMeta.delay_minutes || 0) * 60;
    const rawAdjustedStops = filteredPercorso.map(s => {
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
    const adjustedStops = spreadDuplicateStopTimes(rawAdjustedStops, shape);

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

    let lat = stopA.lat;
    let lon = stopA.lon;
    let bearing = 0;

    const idxA = stopA.shape_index;
    const idxB = stopB.shape_index;
    let busShapeIndex = idxA;
    let exactShapePos = idxA;

    if (shape && shape.length >= 2) {
      if (idxA === idxB || idxB < idxA) {
        const pt = shape[idxA] || shape[0];
        lat = pt[0];
        lon = pt[1];
        busShapeIndex = idxA;
        exactShapePos = idxA;
        const nextPt = shape[Math.min(shape.length - 1, idxA + 1)] || pt;
        bearing = calculateBearing(pt[0], pt[1], nextPt[0], nextPt[1]);
      } else {
        const subPath = shape.slice(idxA, idxB + 1);
        const interp = interpolateAlongPath(subPath, progress);
        lat = interp.lat;
        lon = interp.lon;
        bearing = interp.bearing;
        busShapeIndex = idxA + interp.segmentIndex;
        exactShapePos = Math.round((idxA + interp.segmentIndex + (interp.segProgress || 0)) * 1000) / 1000;
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
      shape_index: busShapeIndex,
      exact_shape_pos: exactShapePos,
      position_type: 'estimated_from_infobus',
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
