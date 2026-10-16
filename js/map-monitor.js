/**
 * Módulo de Monitoreo Multi-Usuario en Tiempo Real sobre Google Maps
 * Compatible 100% con el esquema de datos de https://github.com/JJamesrxzn7/AppMovil
 * - Escucha en vivo toda la colección `dispositivos` de Firebase Firestore (appmovil-67ee7)
 * - Consulta cada 1000ms la API externa (si se configura) + latido sincronizado de 1000ms
 * - Renderiza simultáneamente a TODOS los usuarios conectados sobre Google Maps Calles (mt{s}.google.com)
 */

class MapMonitor {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.engine = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.MAP_ENGINE) || 'leaflet';
    this.googleMapsApiKey = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.GOOGLE_MAPS_KEY) || '';
    this.customApiUrl = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.CUSTOM_API_URL) || '';

    const savedSim = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.SIMULATION_ENABLED);
    this.simulationEnabled = savedSim === null ? true : savedSim === 'true';

    this.map = null;
    this.isMonitoring = true;
    this.updateIntervalMs = 1000; // Ciclo estricto de 1000ms
    this.intervalId = null;
    this.isFetchingApi = false;
    this.firestoreUnsubscribe = null;

    // Selección actual: 'ALL' para ver todos o el deviceId de un usuario específico
    this.selectedDeviceId = 'ALL';
    this.autoCenter = false;
    this.hasFitInitialBounds = false;

    // Registro en memoria de todos los dispositivos conectados:
    // deviceId -> { telemetry, pathCoordinates, totalDistanceMeters, lastCoordinate, pingsCount, marker, accuracyCircle, polyline, isSimulated, historyLoaded }
    this.devices = new Map();

    // Perfiles de demostración en vivo (se mueven cada 1000ms por las calles de Google Maps)
    this.simProfiles = [
      { deviceId: 'Movil-Carlos-01', alias: 'Pana Carlos', lat: 4.7110, lng: -74.0721, speedKmH: 28.5, heading: 42, batteryLevel: 91, altitude: 2552 },
      { deviceId: 'Movil-Juan-02', alias: 'Juan (Moto 1)', lat: 4.7082, lng: -74.0695, speedKmH: 36.2, heading: 125, batteryLevel: 78, altitude: 2549 },
      { deviceId: 'Movil-Ana-03', alias: 'Ana Gómez', lat: 4.7135, lng: -74.0748, speedKmH: 19.4, heading: 260, batteryLevel: 84, altitude: 2555 },
      { deviceId: 'Movil-David-04', alias: 'David (Unidad 4)', lat: 4.7068, lng: -74.0752, speedKmH: 44.0, heading: 15, batteryLevel: 63, altitude: 2550 }
    ];

    this.callbacks = {
      onDevicesUpdated: null,
      onHeartbeatTick: null,
      onStatusChange: null
    };
  }

  async setEngine(newEngine, apiKey = '') {
    this.engine = newEngine;
    if (apiKey) {
      this.googleMapsApiKey = apiKey;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.GOOGLE_MAPS_KEY, apiKey);
    }
    localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.MAP_ENGINE, newEngine);
    this.clearAllMapLayers();
    await this.initMap();
    this.renderAllDevicesOnMap();
  }

  async initMap() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = '';

    if (this.engine === 'google' && this.googleMapsApiKey) {
      try {
        await this.loadGoogleMapsSdk(this.googleMapsApiKey);
        this.initGoogleMap();
        return;
      } catch (err) {
        console.warn('Fallo al cargar Google Maps JS SDK, usando capa oficial Google Maps sobre Leaflet:', err);
        this.engine = 'leaflet';
      }
    }

    this.initLeafletMap();
  }

  loadGoogleMapsSdk(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) existingScript.remove();

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps API.'));
      document.head.appendChild(script);
    });
  }

  initGoogleMap() {
    const defaultCenter = { lat: 4.7110, lng: -74.0721 };
    const mapOptions = {
      center: defaultCenter,
      zoom: 16,
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy',
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    };

    this.map = new google.maps.Map(document.getElementById(this.containerId), mapOptions);
    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('google', true);
  }

  // Inicializa el mapa con las capas oficiales de Google Maps (Calles, Satélite Híbrido, Terreno)
  initLeafletMap() {
    if (typeof L === 'undefined') return;

    const defaultCenter = [4.7110, -74.0721];

    this.map = L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView(defaultCenter, 16);

    // Capas oficiales de Google Maps (idénticas a https://github.com/JJamesrxzn7/AppMovil)
    this.tileLayers = {
      google_streets: L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        attribution: '&copy; Google Maps'
      }),
      google_hybrid: L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        attribution: '&copy; Google Maps'
      }),
      google_terrain: L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        attribution: '&copy; Google Maps'
      }),
      esri_streets: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri &mdash; Street Map'
      })
    };

    this.currentTileStyle = 'google_streets';
    this.activeTileLayer = this.tileLayers[this.currentTileStyle].addTo(this.map);

    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('leaflet', true);
  }

  cycleTileStyle() {
    if (this.engine === 'google' && window.google && this.map) {
      const types = ['roadmap', 'hybrid', 'terrain', 'satellite'];
      const cur = this.map.getMapTypeId() || 'roadmap';
      const next = types[(types.indexOf(cur) + 1) % types.length];
      this.map.setMapTypeId(next);
      return `Google Maps (${next.toUpperCase()})`;
    }

    if (this.engine !== 'leaflet' || !this.map || !this.tileLayers) return null;

    const styles = ['google_streets', 'google_hybrid', 'google_terrain', 'esri_streets'];
    const names = {
      google_streets: 'Google Maps (Calles y Avenidas)',
      google_hybrid: 'Google Maps (Satélite Híbrido)',
      google_terrain: 'Google Maps (Terreno / Relieve)',
      esri_streets: 'ESRI (Mapa Urbano)'
    };

    const currentIdx = Math.max(0, styles.indexOf(this.currentTileStyle));
    const nextIdx = (currentIdx + 1) % styles.length;
    const nextStyle = styles[nextIdx];

    if (this.activeTileLayer) {
      this.map.removeLayer(this.activeTileLayer);
    }

    this.currentTileStyle = nextStyle;
    this.activeTileLayer = this.tileLayers[nextStyle].addTo(this.map);
    this.activeTileLayer.bringToBack();

    return names[nextStyle];
  }

  /**
   * Inicia el monitoreo en tiempo real de TODOS los usuarios conectados:
   * 1) Suscripción reactiva onSnapshot a toda la colección `dispositivos` en Firestore
   * 2) Ciclo sincronizado cada 1000ms para consultar API externa / actualizar flota demo / refrescar UI
   */
  startMonitoringAllUsers() {
    this.isMonitoring = true;

    // 1. Escuchar toda la colección `dispositivos` de Firebase Firestore en tiempo real
    this.startFirestoreCollectionListener();

    // 2. Ciclo estricto de 1000ms
    if (this.intervalId) clearInterval(this.intervalId);
    this.tick1000ms();
    this.intervalId = setInterval(() => {
      if (this.isMonitoring) {
        this.tick1000ms();
      }
    }, this.updateIntervalMs);
  }

  stopMonitoringAllUsers() {
    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }
  }

  startFirestoreCollectionListener() {
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }

    const db = window.FirebaseManager.getFirestoreDb();
    if (!db) return false;

    try {
      this.firestoreUnsubscribe = db.collection('dispositivos').onSnapshot(
        (querySnapshot) => {
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = data.deviceId || docSnap.id;
            if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
              this.upsertDeviceTelemetry(
                {
                  ...data,
                  deviceId: id,
                  alias: data.deviceName || data.alias || id
                },
                false
              );
            }
          });
          this.notifyUpdate();
        },
        (err) => {
          console.warn('Aviso en onSnapshot de colección dispositivos:', err.message);
        }
      );
      return true;
    } catch (e) {
      console.warn('No se pudo suscribir a la colección dispositivos:', e);
      return false;
    }
  }

  async tick1000ms() {
    // 1. Si hay una URL de API externa configurada, consultarla cada 1000ms sin solapamiento
    if (this.customApiUrl && !this.isFetchingApi) {
      this.fetchExternalApi1000ms();
    }

    // 2. Si el modo demostración está activo, mover los usuarios de prueba cada 1000ms
    if (this.simulationEnabled) {
      this.stepSimulatedUsers();
    } else {
      this.removeSimulatedUsers();
    }

    // 3. Emitir pulso de 1000ms y notificar a la interfaz
    if (this.callbacks.onHeartbeatTick) {
      this.callbacks.onHeartbeatTick();
    }

    this.notifyUpdate();
  }

  async fetchExternalApi1000ms() {
    this.isFetchingApi = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(this.customApiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });

      if (response.ok) {
        const json = await response.json();
        const list = Array.isArray(json)
          ? json
          : json.dispositivos || json.users || json.locations || json.data || [json];

        list.forEach((item, idx) => {
          if (!item || typeof item !== 'object') return;
          const lat = Number(item.latitude ?? item.lat ?? item.latitud);
          const lng = Number(item.longitude ?? item.lng ?? item.lon ?? item.longitud);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const deviceId = String(item.deviceId ?? item.id ?? item.userId ?? `API-Movil-${idx + 1}`);
          this.upsertDeviceTelemetry(
            {
              deviceId,
              alias: item.deviceName || item.alias || item.name || deviceId,
              latitude: lat,
              longitude: lng,
              accuracy: Number(item.accuracy ?? item.precision ?? 8),
              altitude: Number(item.altitude ?? item.altitud ?? 2550),
              speedKmH: Number(item.speedKmH ?? item.speed ?? item.velocidad ?? 0),
              heading: Number(item.heading ?? item.rumbo ?? 0),
              batteryLevel: Number(item.batteryLevel ?? item.battery ?? item.bateria ?? 100),
              orientation: item.orientation || { alpha: 0, beta: 0, gamma: 0 },
              status: 'online',
              updatedAtEpoch: Date.now()
            },
            false
          );
        });
      }
    } catch (e) {
      // Silenciar micro-cortes para no saturar consola cada segundo
    } finally {
      clearTimeout(timer);
      this.isFetchingApi = false;
    }
  }

  stepSimulatedUsers() {
    const dtHours = this.updateIntervalMs / 3600000;

    this.simProfiles.forEach((sim) => {
      sim.heading = (sim.heading + (Math.random() - 0.48) * 16 + 360) % 360;
      sim.speedKmH = Number(
        Math.max(5, Math.min(62, sim.speedKmH + (Math.random() - 0.48) * 3.5)).toFixed(1)
      );

      const distKm = sim.speedKmH * dtHours;
      const rad = (sim.heading * Math.PI) / 180;
      sim.lat += (distKm / 111.32) * Math.cos(rad);
      sim.lng += (distKm / (111.32 * Math.cos((sim.lat * Math.PI) / 180))) * Math.sin(rad);

      const orientation = {
        alpha: Math.round(sim.heading),
        beta: Math.round((Math.random() - 0.5) * 12),
        gamma: Math.round((Math.random() - 0.5) * 8)
      };

      this.upsertDeviceTelemetry(
        {
          deviceId: sim.deviceId,
          alias: sim.alias,
          latitude: sim.lat,
          longitude: sim.lng,
          accuracy: Number((4.0 + Math.random() * 4.5).toFixed(1)),
          altitude: sim.altitude,
          speedKmH: sim.speedKmH,
          heading: Math.round(sim.heading),
          batteryLevel: sim.batteryLevel,
          orientation,
          status: 'online',
          updatedAtEpoch: Date.now()
        },
        true
      );
    });
  }

  removeSimulatedUsers() {
    for (const [id, entry] of this.devices.entries()) {
      if (entry.isSimulated) {
        this.removeDeviceFromMap(entry);
        this.devices.delete(id);
      }
    }
  }

  /**
   * Registra o actualiza la posición, trayectoria y marcador de un usuario conectado
   */
  upsertDeviceTelemetry(telemetry, isSimulated = false) {
    const id = telemetry.deviceId;
    if (!id) return;

    const lat = Number(telemetry.latitude);
    const lng = Number(telemetry.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    let entry = this.devices.get(id);
    if (!entry) {
      entry = {
        deviceId: id,
        alias: telemetry.alias || telemetry.deviceName || id,
        telemetry: {},
        pathCoordinates: [],
        totalDistanceMeters: 0,
        lastCoordinate: null,
        pingsCount: 0,
        marker: null,
        accuracyCircle: null,
        polyline: null,
        isSimulated,
        historyLoaded: false
      };
      this.devices.set(id, entry);

      // Si es un dispositivo real de Firestore, cargar sus últimos puntos de la subcolección `historial`
      if (!isSimulated) {
        this.loadDeviceHistoryFromFirestore(id, entry);
      }
    }

    entry.alias = telemetry.alias || telemetry.deviceName || entry.alias || id;
    entry.isSimulated = isSimulated;

    if (entry.lastCoordinate) {
      const deltaMeters = this.calculateHaversineDistance(
        entry.lastCoordinate.lat,
        entry.lastCoordinate.lng,
        lat,
        lng
      );
      if (deltaMeters > 0.4) {
        entry.totalDistanceMeters += deltaMeters;
      }
    }

    entry.lastCoordinate = { lat, lng };
    entry.pathCoordinates.push({ lat, lng });
    if (entry.pathCoordinates.length > 80) {
      entry.pathCoordinates.shift();
    }

    entry.pingsCount = telemetry.pingsSent || entry.pingsCount + 1;

    const now = Date.now();
    const epoch = telemetry.updatedAtEpoch || now;
    const isOnline = telemetry.status !== 'offline' && now - epoch < 30000;

    entry.telemetry = {
      ...telemetry,
      deviceId: id,
      alias: entry.alias,
      latitude: lat,
      longitude: lng,
      speedKmH: Number(telemetry.speedKmH ?? 0),
      accuracy: Number(telemetry.accuracy ?? 10),
      altitude: telemetry.altitude ?? null,
      heading: typeof telemetry.heading === 'number' ? telemetry.heading : 0,
      batteryLevel: telemetry.batteryLevel ?? null,
      orientation: telemetry.orientation || { alpha: null, beta: null, gamma: null },
      totalDistanceMeters: Math.round(entry.totalDistanceMeters),
      pingsSent: entry.pingsCount,
      isOnline,
      updatedAtEpoch: epoch
    };

    this.renderSingleDeviceOnMap(entry);

    if (!this.hasFitInitialBounds && this.devices.size > 0) {
      this.hasFitInitialBounds = true;
      this.fitAllDevicesBounds();
    } else if (this.autoCenter && this.selectedDeviceId === id) {
      this.panToLocation(lat, lng);
    }
  }

  async loadDeviceHistoryFromFirestore(deviceId, entry) {
    if (entry.historyLoaded) return;
    entry.historyLoaded = true;

    try {
      const db = window.FirebaseManager.getFirestoreDb();
      if (!db) return;

      const snapshot = await db
        .collection('dispositivos')
        .doc(deviceId)
        .collection('historial')
        .orderBy('epoch', 'asc')
        .limitToLast(60)
        .get();

      if (!snapshot.empty) {
        const histCoords = [];
        let dist = 0;
        let prev = null;
        snapshot.forEach((doc) => {
          const pt = doc.data();
          if (typeof pt.lat === 'number' && typeof pt.lng === 'number') {
            if (prev) {
              const d = this.calculateHaversineDistance(prev.lat, prev.lng, pt.lat, pt.lng);
              if (d > 0.4) dist += d;
            }
            prev = { lat: pt.lat, lng: pt.lng };
            histCoords.push(prev);
          }
        });
        if (histCoords.length > 0) {
          entry.pathCoordinates = histCoords;
          entry.totalDistanceMeters = dist;
          this.renderSingleDeviceOnMap(entry);
        }
      }
    } catch (_) {
      // Ignorar si no hay historial previo
    }
  }

  renderAllDevicesOnMap() {
    for (const entry of this.devices.values()) {
      this.renderSingleDeviceOnMap(entry);
    }
  }

  renderSingleDeviceOnMap(entry) {
    if (!this.map || !entry.telemetry) return;

    const { latitude: lat, longitude: lng, heading = 0, accuracy = 10, alias, speedKmH = 0 } = entry.telemetry;
    const isSelected = this.selectedDeviceId === entry.deviceId || (this.selectedDeviceId === 'ALL' && this.devices.size === 1);
    const strokeColor = isSelected ? '#00f2fe' : '#38bdf8';

    if (this.engine === 'google' && window.google) {
      const gLatLng = new google.maps.LatLng(lat, lng);
      const gPath = entry.pathCoordinates.map((c) => new google.maps.LatLng(c.lat, c.lng));

      if (!entry.polyline) {
        entry.polyline = new google.maps.Polyline({
          path: gPath,
          geodesic: true,
          strokeColor,
          strokeOpacity: isSelected ? 0.95 : 0.55,
          strokeWeight: isSelected ? 5 : 3,
          map: this.map
        });
      } else {
        entry.polyline.setPath(gPath);
        entry.polyline.setOptions({
          strokeColor,
          strokeOpacity: isSelected ? 0.95 : 0.55,
          strokeWeight: isSelected ? 5 : 3
        });
      }

      if (!entry.marker) {
        entry.marker = new google.maps.Marker({
          position: gLatLng,
          map: this.map,
          title: `${alias} (${speedKmH} km/h)`,
          label: {
            text: `${alias} • ${speedKmH} km/h`,
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 'bold'
          },
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: isSelected ? 7 : 6,
            fillColor: '#00f2fe',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            rotation: heading || 0
          }
        });
        entry.marker.addListener('click', () => {
          this.selectDevice(entry.deviceId, true);
        });
      } else {
        entry.marker.setPosition(gLatLng);
        entry.marker.setLabel({
          text: `${alias} • ${speedKmH} km/h`,
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold'
        });
        const icon = entry.marker.getIcon();
        if (icon && typeof icon === 'object') {
          icon.rotation = heading || 0;
          icon.scale = isSelected ? 7 : 6;
          entry.marker.setIcon(icon);
        }
      }

      if (!entry.accuracyCircle) {
        entry.accuracyCircle = new google.maps.Circle({
          map: this.map,
          center: gLatLng,
          radius: accuracy,
          fillColor: '#00f2fe',
          fillOpacity: isSelected ? 0.16 : 0.08,
          strokeColor: '#00f2fe',
          strokeOpacity: isSelected ? 0.6 : 0.3,
          strokeWeight: 1
        });
      } else {
        entry.accuracyCircle.setCenter(gLatLng);
        entry.accuracyCircle.setRadius(accuracy);
      }
    } else if (this.engine === 'leaflet' && typeof L !== 'undefined') {
      const lLatLng = [lat, lng];
      const lPath = entry.pathCoordinates.map((c) => [c.lat, c.lng]);

      if (!entry.polyline) {
        entry.polyline = L.polyline(lPath, {
          color: strokeColor,
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 0.92 : 0.5,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(this.map);
      } else {
        entry.polyline.setLatLngs(lPath);
        entry.polyline.setStyle({
          color: strokeColor,
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 0.92 : 0.5
        });
      }

      const safeAlias = String(alias)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const markerHtml = `
        <div class="user-floating-tag">
          <span>${safeAlias}</span>
          <span class="tag-speed">${Number(speedKmH).toFixed(1)} km/h</span>
        </div>
        <div class="user-gps-radar-ring"></div>
        <div class="user-gps-pointer" style="transform: rotate(${heading || 0}deg);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#00f2fe" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      `;

      const icon = L.divIcon({
        className: `user-gps-pulse-marker ${isSelected ? 'selected-marker' : ''}`,
        html: markerHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      if (!entry.marker) {
        entry.marker = L.marker(lLatLng, {
          icon,
          zIndexOffset: isSelected ? 1000 : 100
        }).addTo(this.map);

        entry.marker.on('click', () => {
          this.selectDevice(entry.deviceId, true);
        });
      } else {
        entry.marker.setLatLng(lLatLng);
        entry.marker.setIcon(icon);
        entry.marker.setZIndexOffset(isSelected ? 1000 : 100);
      }

      if (!entry.accuracyCircle) {
        entry.accuracyCircle = L.circle(lLatLng, {
          radius: accuracy,
          color: '#00f2fe',
          fillColor: '#00f2fe',
          fillOpacity: isSelected ? 0.16 : 0.08,
          weight: 1
        }).addTo(this.map);
      } else {
        entry.accuracyCircle.setLatLng(lLatLng);
        entry.accuracyCircle.setRadius(accuracy);
      }
    }
  }

  removeDeviceFromMap(entry) {
    if (!this.map || !entry) return;
    if (this.engine === 'google' && window.google) {
      if (entry.marker) entry.marker.setMap(null);
      if (entry.polyline) entry.polyline.setMap(null);
      if (entry.accuracyCircle) entry.accuracyCircle.setMap(null);
    } else if (this.engine === 'leaflet') {
      if (entry.marker) this.map.removeLayer(entry.marker);
      if (entry.polyline) this.map.removeLayer(entry.polyline);
      if (entry.accuracyCircle) this.map.removeLayer(entry.accuracyCircle);
    }
    entry.marker = null;
    entry.polyline = null;
    entry.accuracyCircle = null;
  }

  clearAllMapLayers() {
    for (const entry of this.devices.values()) {
      this.removeDeviceFromMap(entry);
    }
  }

  selectDevice(deviceId, shouldCenter = true) {
    this.selectedDeviceId = deviceId;
    this.autoCenter = deviceId !== 'ALL';
    this.renderAllDevicesOnMap();

    if (shouldCenter) {
      if (deviceId === 'ALL') {
        this.fitAllDevicesBounds();
      } else {
        const target = this.devices.get(deviceId);
        if (target && target.telemetry) {
          this.panToLocation(target.telemetry.latitude, target.telemetry.longitude, 17);
        }
      }
    }

    this.notifyUpdate();
  }

  fitAllDevicesBounds() {
    if (!this.map || this.devices.size === 0) return;

    const coords = Array.from(this.devices.values())
      .map((d) => d.telemetry)
      .filter((t) => t && Number.isFinite(t.latitude) && Number.isFinite(t.longitude));

    if (coords.length === 0) return;

    if (coords.length === 1) {
      this.panToLocation(coords[0].latitude, coords[0].longitude, 17);
      return;
    }

    if (this.engine === 'google' && window.google) {
      const bounds = new google.maps.LatLngBounds();
      coords.forEach((c) => bounds.extend(new google.maps.LatLng(c.latitude, c.longitude)));
      this.map.fitBounds(bounds);
    } else if (this.engine === 'leaflet' && typeof L !== 'undefined') {
      const bounds = L.latLngBounds(coords.map((c) => [c.latitude, c.longitude]));
      this.map.flyToBounds(bounds, {
        paddingTopLeft: [50, 90],
        paddingBottomRight: [50, 240],
        maxZoom: 17,
        duration: 0.6
      });
    }
  }

  panToLocation(lat, lng, zoomLevel = null) {
    if (!this.map) return;

    if (this.engine === 'google' && window.google) {
      const gPos = new google.maps.LatLng(lat, lng);
      this.map.panTo(gPos);
      if (zoomLevel) this.map.setZoom(zoomLevel);
    } else if (this.engine === 'leaflet') {
      if (zoomLevel) {
        this.map.setView([lat, lng], zoomLevel, { animate: true, duration: 0.5 });
      } else {
        this.map.panTo([lat, lng], { animate: true, duration: 0.5 });
      }
    }
  }

  clearAllPaths() {
    for (const entry of this.devices.values()) {
      entry.pathCoordinates = entry.lastCoordinate ? [entry.lastCoordinate] : [];
      entry.totalDistanceMeters = 0;
      if (entry.telemetry) {
        entry.telemetry.totalDistanceMeters = 0;
      }
      this.renderSingleDeviceOnMap(entry);
    }
    this.notifyUpdate();
  }

  setSimulationEnabled(enabled) {
    this.simulationEnabled = Boolean(enabled);
    localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.SIMULATION_ENABLED, String(this.simulationEnabled));
    if (!this.simulationEnabled) {
      this.removeSimulatedUsers();
    } else {
      this.stepSimulatedUsers();
    }
    this.notifyUpdate();
  }

  setCustomApiUrl(url) {
    this.customApiUrl = (url || '').trim();
    localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.CUSTOM_API_URL, this.customApiUrl);
  }

  notifyUpdate() {
    if (!this.callbacks.onDevicesUpdated) return;
    const allTelemetries = Array.from(this.devices.values()).map((d) => d.telemetry);
    this.callbacks.onDevicesUpdated(allTelemetries, this.selectedDeviceId);
  }

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

window.MapMonitor = MapMonitor;

