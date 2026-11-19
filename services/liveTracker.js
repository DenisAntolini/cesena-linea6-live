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
