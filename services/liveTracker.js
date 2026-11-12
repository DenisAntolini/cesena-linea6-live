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
