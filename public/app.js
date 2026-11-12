/**
 * Cesena Linea 6 Live • Google Maps Transit Web Application
 * Start Romagna • Tracciamento GPS su percorsi reali & "Riuscirò a prenderlo?"
 */

(() => {
  'use strict';

  // Configurazione globale
  const CONFIG = {
    CESENA_CENTER: [44.1420, 12.2430],
    DEFAULT_ZOOM: 14,
    POLL_INTERVAL_MS: 5000,
    ANIMATION_DURATION_MS: 1800,
    API_STATIC: '/api/linea6/static',
    API_LIVE: '/api/linea6/live',
    API_ARRIVALS: '/api/linea6/arrivals',
    COLOR_DIR0: '#1A73E8', // Google Blue
    COLOR_DIR1: '#0D652D', // Transit Green
    APPROACHING_COLOR: '#1A73E8'
  };

  // Stato dell'applicazione
  const state = {
    map: null,
    staticData: null,
    currentDirection: 0, // 0 = Montefiore, 1 = Rio Maggiore
    selectedStopId: null,
    walkingMinutes: 2, // Calcolato in automatico
    userGps: null, // { lat, lon }
    busesMap: new Map(), // busId -> { data, marker, anim }
    stopsMarkersMap: new Map(), // stopId -> L.circleMarker
    userSelectedStopMarker: null,
    userGpsMarker: null,
    layers: {
      routesGroup: null,
      approachingGroup: null,
      stopsGroup: null,
      busesGroup: null,
      userGroup: null,
      dir0Polylines: [],
      dir1Polylines: []
    },
    pollTimer: null,
    lastArrivalsData: null
  };

  // Elementi DOM
  const dom = {
    transitCard: document.getElementById('transitCard'),
    dirTab0: document.getElementById('dirTab0'),
    dirTab1: document.getElementById('dirTab1'),
    stopSelect: document.getElementById('stopSelect'),
    nearMeBtn: document.getElementById('nearMeBtn'),
    floatingNearMeBtn: document.getElementById('floatingNearMeBtn'),
    gpsStatusNote: document.getElementById('gpsStatusNote'),
    nextBusContainer: document.getElementById('nextBusContainer'),
    subsequentList: document.getElementById('subsequentList'),
    fitRouteBtn: document.getElementById('fitRouteBtn'),
    toggleCollapseBtn: document.getElementById('toggleCollapseBtn')
  };

  /* ==========================================================================
     UTILITIES GEODESICHE
     ========================================================================== */
  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /* ==========================================================================
     1. INIZIALIZZAZIONE MAPPA LEAFLET STILE GOOGLE MAPS
     ========================================================================== */
  function initMap() {
    state.map = L.map('map', {
      center: CONFIG.CESENA_CENTER,
      zoom: CONFIG.DEFAULT_ZOOM,
      zoomControl: false
    });

    // Zoom controls posizionati in basso a destra stile Google Maps
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    // Layer CartoDB Voyager predefinito (stile Google Maps Transit pulito senza api key)
    const voyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(state.map);

    // Layer OpenStreetMap di fallback
    const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: 'osm-tile-layer'
    });

    // Controllo layer mappa in alto a destra
    L.control.layers({
      'Mappa Transit (CartoDB)': voyagerLayer,
      'OpenStreetMap': osmStandard
    }, null, { position: 'topright' }).addTo(state.map);

    // Gruppi di Layer ordinati
    state.layers.routesGroup = L.layerGroup().addTo(state.map);
    state.layers.approachingGroup = L.layerGroup().addTo(state.map);
    state.layers.stopsGroup = L.layerGroup().addTo(state.map);
    state.layers.busesGroup = L.layerGroup().addTo(state.map);
    state.layers.userGroup = L.layerGroup().addTo(state.map);
  }

  /* ==========================================================================
     2. CARICAMENTO DATI STATICI & TRACCIATO REALE AD ALTA RISOLUZIONE
     ========================================================================== */
  async function loadStaticData() {
    try {
      const response = await fetch(CONFIG.API_STATIC);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.staticData = data;

      renderRoutes(data);
      renderStops(data);
      populateStopsDropdown(state.currentDirection);

      // Seleziona la prima fermata (o Cesena Stazione FS)
      const currentStops = data.routes_by_direction?.[String(state.currentDirection)]?.stops || [];
      const defaultStop = currentStops.find(s => s.stop_id === 'CE_6011' || s.stop_name.toLowerCase().includes('stazione')) || currentStops[0];
      if (defaultStop) {
        selectStop(defaultStop.stop_id, false);
      }

      fitRouteBounds();
    } catch (err) {
      console.error('Errore caricamento dati statici:', err);
    }
  }

  function renderRoutes(data) {
    state.layers.routesGroup.clearLayers();
    state.layers.dir0Polylines = [];
    state.layers.dir1Polylines = [];

    // USA DIRETTAMENTE L'ARRAY AD ALTA RISOLUZIONE CURVA PER CURVA (218 vertici)
    const shape0 = data.shape_dir_0 || data.routes_by_direction?.['0']?.shape || [];
    const shape1 = data.shape_dir_1 || data.routes_by_direction?.['1']?.shape || [];

    // Polilinea Direzione 0 (Montefiore - Tracciato generale celeste chiaro con bordo bianco)
    if (shape0.length > 0) {
      const casing = L.polyline(shape0, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });

      const line = L.polyline(shape0, {
        color: '#93C5FD',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      state.layers.dir0Polylines.push(casing, line);
    }

    // Polilinea Direzione 1 (Rio Maggiore - Tracciato generale celeste chiaro con bordo bianco)
    if (shape1.length > 0) {
      const casing = L.polyline(shape1, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });

      const line = L.polyline(shape1, {
        color: '#93C5FD',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      state.layers.dir1Polylines.push(casing, line);
    }

    updateMapVisualHierarchy();
  }

  function renderStops(data) {
    state.layers.stopsGroup.clearLayers();
    state.stopsMarkersMap.clear();

    const drawStopsForDir = (stops, dirId) => {
      if (!stops) return;
      stops.forEach((stop, index) => {
        const isTerminus = (index === 0 || index === stops.length - 1);

        // Cerchio pulito stile Google Maps: bianco con bordo blu 2.5px
        const marker = L.circleMarker([stop.lat, stop.lon], {
          radius: isTerminus ? 6 : 5,
          fillColor: isTerminus ? '#1A73E8' : '#FFFFFF',
          color: '#1A73E8',
          weight: 2.5,
          opacity: 1,
          fillOpacity: 1,
          className: `stop-circle-marker dir-${dirId}`
        });

        // Click sulla fermata: seleziona e aggiorna la card
        marker.on('click', () => {
          if (state.currentDirection !== parseInt(dirId, 10)) {
            switchDirection(parseInt(dirId, 10));
          }
          selectStop(stop.stop_id, true);
        });

        // Tooltip solo su HOVER del mouse (nessun cartellino fisso invasivo!)
        marker.bindTooltip(stop.stop_name, {
          permanent: false,
          direction: 'top',
          className: 'gmaps-stop-tooltip',
          offset: [0, -6]
        });

        marker.directionId = String(dirId);
        marker.stopData = stop;
        state.stopsMarkersMap.set(stop.stop_id, marker);
      });
    };

    const dir0 = data.routes_by_direction?.['0'];
    const dir1 = data.routes_by_direction?.['1'];

    if (dir0?.stops) drawStopsForDir(dir0.stops, '0');
    if (dir1?.stops) drawStopsForDir(dir1.stops, '1');

    updateMapVisualHierarchy();
  }

  function updateMapVisualHierarchy() {
    const curDir = String(state.currentDirection);

    // Mostra SOLO la direzione selezionata (nasconde del tutto l'altra rotta)
    state.layers.dir0Polylines.forEach(l => {
      if (curDir === '0') {
        if (!state.layers.routesGroup.hasLayer(l)) state.layers.routesGroup.addLayer(l);
      } else {
        if (state.layers.routesGroup.hasLayer(l)) state.layers.routesGroup.removeLayer(l);
      }
    });

    state.layers.dir1Polylines.forEach(l => {
      if (curDir === '1') {
        if (!state.layers.routesGroup.hasLayer(l)) state.layers.routesGroup.addLayer(l);
      } else {
        if (state.layers.routesGroup.hasLayer(l)) state.layers.routesGroup.removeLayer(l);
      }
    });

    // Mostra SOLO le fermate della direzione corrente
    state.stopsMarkersMap.forEach(marker => {
      if (marker.directionId === curDir) {
        if (!state.layers.stopsGroup.hasLayer(marker)) state.layers.stopsGroup.addLayer(marker);
      } else {
        if (state.layers.stopsGroup.hasLayer(marker)) state.layers.stopsGroup.removeLayer(marker);
      }
    });
  }

  function fitRouteBounds() {
    if (!state.map || !state.layers.routesGroup) return;
    const allLayers = [];
    state.layers.routesGroup.eachLayer(l => allLayers.push(l));
    if (allLayers.length > 0) {
      const group = L.featureGroup(allLayers);
      state.map.fitBounds(group.getBounds(), {
        padding: [40, 40],
        maxZoom: 15
      });
    }
  }

  /* ==========================================================================
     3. SELEZIONE DIREZIONE & POPOLAMENTO FERMATE
     ========================================================================== */
  function populateStopsDropdown(directionId) {
    if (!state.staticData) return;
    const stops = state.staticData.routes_by_direction?.[String(directionId)]?.stops || [];
    dom.stopSelect.innerHTML = '';

    stops.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.stop_id;
      opt.textContent = `${s.stop_name} (Fermata #${s.stop_code || ''})`;
      dom.stopSelect.appendChild(opt);
    });
  }

  function switchDirection(newDir) {
    if (state.currentDirection === newDir) return;
    state.currentDirection = newDir;

    // Aggiorna tab stile Google Maps
    dom.dirTab0.classList.toggle('active', newDir === 0);
    dom.dirTab0.setAttribute('aria-selected', newDir === 0);
    dom.dirTab1.classList.toggle('active', newDir === 1);
    dom.dirTab1.setAttribute('aria-selected', newDir === 1);

    populateStopsDropdown(newDir);
    updateMapVisualHierarchy();

    // Seleziona la prima fermata o corrispondente
    const newStops = state.staticData?.routes_by_direction?.[String(newDir)]?.stops || [];
    let nextStop = newStops.find(s => s.stop_id === state.selectedStopId);
    if (!nextStop) nextStop = newStops[0];

    if (nextStop) {
      selectStop(nextStop.stop_id, true);
    }
    fetchLiveBuses();
  }

  function selectStop(stopId, shouldPan = true) {
    if (!stopId) return;
    state.selectedStopId = stopId;
    dom.stopSelect.value = stopId;

    let stopObj = null;
    const curStops = state.staticData?.routes_by_direction?.[String(state.currentDirection)]?.stops || [];
    stopObj = curStops.find(s => s.stop_id === stopId);
    if (!stopObj && state.stopsMarkersMap.has(stopId)) {
      stopObj = state.stopsMarkersMap.get(stopId).stopData;
    }

    if (stopObj) {
      updateUserStopMarker(stopObj);
      if (shouldPan && state.map) {
        state.map.panTo([stopObj.lat, stopObj.lon], { animate: true, duration: 0.6 });
      }
    }

    fetchArrivals();
  }

  function updateUserStopMarker(stop) {
    if (state.userSelectedStopMarker) {
      state.layers.userGroup.removeLayer(state.userSelectedStopMarker);
    }

    const icon = L.divIcon({
      html: `
        <div class="user-stop-pin-container">
          <div class="user-stop-banner">La tua fermata: <strong>${stop.stop_name}</strong></div>
          <div class="user-stop-pin-icon">
            <div class="user-stop-halo"></div>
            <div class="user-stop-center-dot"></div>
          </div>
        </div>
      `,
      className: 'user-stop-div-icon',
      iconSize: [220, 52],
      iconAnchor: [110, 44]
    });

    state.userSelectedStopMarker = L.marker([stop.lat, stop.lon], {
      icon,
      zIndexOffset: 1500
    }).addTo(state.layers.userGroup);
  }

  /* ==========================================================================
     4. GEOLOCALIZZAZIONE & CALCOLO AUTOMATICO A PIEDI (SENZA BOTTONI SUPERFLUI)
     ========================================================================== */
  function handleNearMe() {
    const handleSuccess = (userLat, userLon, isSimulated = false) => {
      state.userGps = { lat: userLat, lon: userLon };

      // Disegna il punto blu utente stile Google Maps
      if (state.userGpsMarker) {
        state.layers.userGroup.removeLayer(state.userGpsMarker);
      }

      const userIcon = L.divIcon({
        html: `<div class="user-location-dot"></div>`,
        className: 'user-loc-wrapper',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      state.userGpsMarker = L.marker([userLat, userLon], { icon: userIcon, zIndexOffset: 2000 })
        .bindPopup(`<strong>La tua posizione</strong>${isSimulated ? '<br><small>(Centro Cesena)</small>' : ''}`, { offset: [0, -6] })
        .addTo(state.layers.userGroup);

      // Cerca la fermata più vicina
      const curStops = state.staticData?.routes_by_direction?.[String(state.currentDirection)]?.stops || [];
      let closestStop = null;
      let minDistance = Infinity;

      curStops.forEach(s => {
        const d = haversineDistanceMeters(userLat, userLon, s.lat, s.lon);
        if (d < minDistance) {
          minDistance = d;
          closestStop = s;
        }
      });

      if (closestStop) {
        // Calcolo silenzioso automatico dei minuti a piedi (~80 m/min = 4.8 km/h)
        const walkMin = Math.max(1, Math.round(minDistance / 80));
        state.walkingMinutes = walkMin;

        dom.gpsStatusNote.innerHTML = `📍 Sei a <strong>${minDistance}m</strong> dalla fermata (~${walkMin} min a piedi)`;
        dom.gpsStatusNote.style.display = 'block';

        selectStop(closestStop.stop_id, false);

        // Inquadra sia utente che fermata
        const bounds = L.latLngBounds([
          [userLat, userLon],
          [closestStop.lat, closestStop.lon]
        ]);
        state.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => handleSuccess(pos.coords.latitude, pos.coords.longitude, false),
        (err) => {
          console.warn('Geolocalizzazione non concessa o errore, fallback centro Cesena:', err.message);
          handleSuccess(44.1375, 12.2435, true);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    } else {
      handleSuccess(44.1375, 12.2435, true);
    }
  }

  /* ==========================================================================
     5. MOTORE DI CALCOLO ARRIVI ("RIUSCIRÒ A PRENDERLO?")
     ========================================================================== */
  async function fetchArrivals() {
    if (!state.selectedStopId) return;

    try {
      const url = new URL(CONFIG.API_ARRIVALS, window.location.origin);
      url.searchParams.set('stop_id', state.selectedStopId);
      url.searchParams.set('direction', state.currentDirection);
      url.searchParams.set('walking_minutes', state.walkingMinutes);

      if (state.userGps) {
        url.searchParams.set('user_lat', state.userGps.lat);
        url.searchParams.set('user_lon', state.userGps.lon);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      state.lastArrivalsData = data;
      renderPassengerArrivals(data);
      updateApproachingRouteHighlight(data);
    } catch (err) {
      console.warn('Errore fetch arrivals:', err);
    }
  }

  function renderPassengerArrivals(data) {
    const nextBuses = data.next_buses || [];
    if (nextBuses.length === 0) {
      dom.nextBusContainer.innerHTML = `
        <div style="font-size: 13px; color: #5F6368; padding: 10px 0;">
          Nessuna corsa programmata al momento.
        </div>
      `;
      dom.subsequentList.innerHTML = '<div style="color:#5F6368; font-size:12px; padding:6px;">Nessuna corsa successiva.</div>';
      return;
    }

    // 1. Prossimo Autobus LIVE (Elemento 2)
    const firstBus = nextBuses[0];
    const catchability = firstBus.catchability || {
      code: 'EASY',
      badge: '🟢 Fai in tempo a piedi',
      message: 'Arriva con buon anticipo'
    };

    const etaText = firstBus.eta_minutes <= 1 ? 'In arrivo' : `${firstBus.eta_minutes} min`;
    const catchClass = catchability.code.toLowerCase();

    const liveIndicatorHtml = firstBus.is_live
      ? `<span class="live-radar-icon">((•))</span> In arrivo in tempo reale • a ${firstBus.stops_away} fermate da te`
      : `📅 Corsa programmata • a ${firstBus.stops_away} fermate da te`;

    dom.nextBusContainer.innerHTML = `
      <div class="next-bus-hero">
        <div class="next-bus-eta-large">${etaText}</div>
        <div class="next-bus-clock-time">ore ${firstBus.expected_time}</div>
      </div>

      <div class="next-bus-sub">${liveIndicatorHtml}</div>

      <!-- Badge Pillola Immediata Stile Google Maps -->
      <div class="catch-pill ${catchClass}">
        <span>${catchability.badge}</span>
      </div>

      <button class="show-bus-action-btn" id="showBusOnMapBtn">
        🚌 Mostra autobus sulla mappa
      </button>
    `;

    const showBusBtn = document.getElementById('showBusOnMapBtn');
    if (showBusBtn) {
      showBusBtn.addEventListener('click', () => {
        if (firstBus.bus_id && state.busesMap.has(firstBus.bus_id)) {
          const bState = state.busesMap.get(firstBus.bus_id);
          state.map.flyTo([bState.currentLat, bState.currentLon], 16, { duration: 0.8 });
          bState.marker.openPopup();
        } else if (state.userSelectedStopMarker) {
          state.map.flyTo(state.userSelectedStopMarker.getLatLng(), 16, { duration: 0.8 });
        }
      });
    }

    // 2. Passaggi Successivi (Elemento 3: 3 righe compatte)
    const subsequent = nextBuses.slice(1, 4);
    dom.subsequentList.innerHTML = '';

    if (subsequent.length === 0) {
      dom.subsequentList.innerHTML = '<div style="color:#5F6368; font-size:12px; padding:6px;">Nessun altro passaggio nelle prossime 2 ore.</div>';
    } else {
      subsequent.forEach((b) => {
        const item = document.createElement('div');
        item.className = 'subsequent-item';
        item.innerHTML = `
          <div class="sub-item-left">
            <span class="sub-item-badge">6</span>
            <span class="sub-item-dest">➔ ${b.destination}</span>
          </div>
          <div class="sub-item-right">
            ${b.is_live ? '<span class="sub-item-live-dot" title="Live GPS"></span>' : ''}
            <span class="sub-item-eta">tra ${b.eta_minutes} min</span>
            <span class="sub-item-clock">(${b.expected_time})</span>
          </div>
        `;

        item.addEventListener('click', () => {
          if (b.bus_id && state.busesMap.has(b.bus_id)) {
            const bState = state.busesMap.get(b.bus_id);
            state.map.flyTo([bState.currentLat, bState.currentLon], 16, { duration: 0.8 });
            bState.marker.openPopup();
          } else if (state.userSelectedStopMarker) {
            state.map.flyTo(state.userSelectedStopMarker.getLatLng(), 15, { duration: 0.8 });
          }
        });

        dom.subsequentList.appendChild(item);
      });
    }
  }

  /* ==========================================================================
     6. TRACCIATO STRADALE DI AVVICINAMENTO SULLA MAPPA (BLU VIBRANTE 7PX)
     ========================================================================== */
  function updateApproachingRouteHighlight(arrivalsData) {
    state.layers.approachingGroup.clearLayers();

    const firstBus = arrivalsData?.next_buses?.[0];
    if (!firstBus || !firstBus.is_live || !firstBus.live_location) return;

    const dirData = state.staticData?.routes_by_direction?.[String(state.currentDirection)];
    if (!dirData) return;

    const userStop = dirData.stops.find(s => s.stop_id === state.selectedStopId);
    if (!userStop || userStop.shape_index === undefined) return;

    const fullShape = dirData.shape || [];
    if (fullShape.length === 0) return;

    // Trova il vertice della polilinea più vicino alla posizione live del bus
    let bestBusVertex = 0;
    let minD = Infinity;
    fullShape.forEach((pt, idx) => {
      const d = haversineDistanceMeters(firstBus.live_location.lat, firstBus.live_location.lon, pt[0], pt[1]);
      if (d < minD) {
        minD = d;
        bestBusVertex = idx;
      }
    });

    let approachingPoints = [];
    if (bestBusVertex <= userStop.shape_index) {
      approachingPoints = [
        [firstBus.live_location.lat, firstBus.live_location.lon],
        ...fullShape.slice(bestBusVertex, userStop.shape_index + 1)
      ];
    } else {
      approachingPoints = [
        [firstBus.live_location.lat, firstBus.live_location.lon],
        [userStop.lat, userStop.lon]
      ];
    }

    if (approachingPoints.length > 1) {
      // Casing bianco
      L.polyline(approachingPoints, {
        color: '#FFFFFF',
        weight: 10,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.layers.approachingGroup);

      // Tratto attivo blu Google Maps vibrante (7px)
      L.polyline(approachingPoints, {
        color: '#1A73E8',
        weight: 7,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.layers.approachingGroup);
    }
  }

  /* ==========================================================================
     7. MOTORE DI ANIMAZIONE 60FPS E MARKER AUTOBUS LIVE STILE GOOGLE MAPS
     ========================================================================== */
  function createBusDivIcon(bus) {
    const isDir1 = Number(bus.direction_id) === 1;
    const dirClass = isDir1 ? 'dir-1' : 'dir-0';
    const bearing = bus.bearing || 0;

    let etaBadgeText = 'Bus 6 • in marcia';
    if (bus.status === 'STOPPED_AT') {
      etaBadgeText = 'Bus 6 • In fermata';
    } else if (bus.eta_minutes !== undefined && bus.eta_minutes !== null) {
      etaBadgeText = bus.eta_minutes <= 1 ? 'Bus 6 • In arrivo' : `Bus 6 • tra ${bus.eta_minutes} min`;
    }

    const html = `
      <div class="gmaps-bus-marker ${dirClass}" id="marker-${bus.id}">
        <div class="gmaps-bus-radar-ring"></div>
        <div class="gmaps-bus-arrow" style="transform: rotate(${bearing}deg);">
          <svg width="8" height="8" viewBox="0 0 10 10">
            <polygon points="5,0 10,10 5,7 0,10" fill="#1A73E8"/>
          </svg>
        </div>
        <div class="gmaps-bus-core" title="${bus.vehicle_label}">
          <span>6</span>
        </div>
        <div class="gmaps-bus-eta-badge">${etaBadgeText}</div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'gmaps-bus-div-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  }
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  }

  function shortestAngleDiff(targetDeg, currentDeg) {
    return ((((targetDeg - currentDeg) % 360) + 540) % 360) - 180;
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function animateMarker(busState, targetLat, targetLon, targetBearing, durationMs) {
    if (!busState.marker) return;

    const startLat = busState.currentLat;
    const startLon = busState.currentLon;
    const startBearing = busState.currentBearing;
    const bearingDelta = shortestAngleDiff(targetBearing, startBearing);

    const startTime = performance.now();
    busState.targetLat = targetLat;
    busState.targetLon = targetLon;
    busState.targetBearing = targetBearing;

    if (busState.rafId) cancelAnimationFrame(busState.rafId);

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeInOutQuad(progress);

      const curLat = startLat + (targetLat - startLat) * eased;
      const curLon = startLon + (targetLon - startLon) * eased;
      const curBearing = (startBearing + bearingDelta * eased + 360) % 360;

      busState.currentLat = curLat;
      busState.currentLon = curLon;
      busState.currentBearing = curBearing;

      busState.marker.setLatLng([curLat, curLon]);

      const el = busState.marker.getElement();
      if (el) {
        const arrow = el.querySelector('.gmaps-bus-arrow');
        if (arrow) arrow.style.transform = `rotate(${curBearing.toFixed(1)}deg)`;
      }

      if (progress < 1) {
        busState.rafId = requestAnimationFrame(step);
      }
    }

    busState.rafId = requestAnimationFrame(step);
  }

  /* ==========================================================================
     8. POLLING IN TEMPO REALE & AGGIORNAMENTO
     ========================================================================== */
  async function fetchLiveBuses() {
    try {
      const response = await fetch(CONFIG.API_LIVE);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();

      syncBusMarkers(payload.buses || []);

      if (state.selectedStopId) {
        fetchArrivals();
      }
    } catch (err) {
      console.warn('Errore fetch /api/linea6/live:', err.message);
    }
  }

  function syncBusMarkers(buses) {
    const curDir = Number(state.currentDirection);
    // Mostra SOLO i bus appartenenti alla direzione selezionata dall'utente
    const filteredBuses = (buses || []).filter(b => Number(b.direction_id) === curDir);
    const incomingIds = new Set(filteredBuses.map(b => b.id));

    // Rimuovi bus non più attivi o dell'altra direzione
    for (const [id, busState] of state.busesMap.entries()) {
      if (!incomingIds.has(id)) {
        if (busState.rafId) cancelAnimationFrame(busState.rafId);
        state.layers.busesGroup.removeLayer(busState.marker);
        state.busesMap.delete(id);
      }
    }

    filteredBuses.forEach(bus => {
      let busState = state.busesMap.get(bus.id);

      if (!busState) {
        const icon = createBusDivIcon(bus);
        const marker = L.marker([bus.lat, bus.lon], { icon, zIndexOffset: 1000 });

        const popupContent = `
          <div class="gmaps-popup">
            <div class="gmaps-popup-title">Linea 6 • ${bus.direction_name}</div>
            <div class="gmaps-popup-sub">
              ${bus.vehicle_label} • <strong>${bus.speed_kmh} km/h</strong><br>
              Prossima: <strong>${bus.next_stop?.stop_name || 'Capolinea'}</strong>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent, { offset: [0, -18] });
        marker.addTo(state.layers.busesGroup);

        busState = {
          busId: bus.id,
          marker,
          data: bus,
          currentLat: bus.lat,
          currentLon: bus.lon,
          currentBearing: bus.bearing || 0,
          targetLat: bus.lat,
          targetLon: bus.lon,
          targetBearing: bus.bearing || 0,
          rafId: null
        };

        state.busesMap.set(bus.id, busState);

        marker.on('click', () => {
          marker.openPopup();
        });
      } else {
        busState.data = bus;
        animateMarker(
          busState,
          bus.lat,
          bus.lon,
          bus.bearing || 0,
          CONFIG.ANIMATION_DURATION_MS
        );
      }
    });
  }

  /* ==========================================================================
     9. EVENT LISTENERS & SETUP
     ========================================================================== */
  function setupEventListeners() {
    dom.dirTab0.addEventListener('click', () => switchDirection(0));
    dom.dirTab1.addEventListener('click', () => switchDirection(1));

    dom.stopSelect.addEventListener('change', (e) => {
      selectStop(e.target.value, true);
    });

    if (dom.nearMeBtn) dom.nearMeBtn.addEventListener('click', handleNearMe);
    if (dom.floatingNearMeBtn) dom.floatingNearMeBtn.addEventListener('click', handleNearMe);

    if (dom.fitRouteBtn) dom.fitRouteBtn.addEventListener('click', fitRouteBounds);

    if (dom.toggleCollapseBtn) {
      dom.toggleCollapseBtn.addEventListener('click', () => {
        dom.transitCard.classList.toggle('collapsed');
      });
    }
  }

  async function init() {
    initMap();
    setupEventListeners();
    await loadStaticData();
    await fetchLiveBuses();

    // Polling periodico
    state.pollTimer = setInterval(fetchLiveBuses, CONFIG.POLL_INTERVAL_MS);
    console.log('Cesena Linea 6 Live • Google Maps Transit UI attiva.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
