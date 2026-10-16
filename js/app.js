/**
 * Controlador de la Aplicación Móvil de Monitoreo (GeoLive Monitor - Admin)
 * Visualiza en tiempo real (1000ms) la ubicación y sensores de TODOS los usuarios conectados
 * sobre Google Maps, sincronizado con Firebase Firestore (`appmovil-67ee7`) y API externa.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const monitor = new MapMonitor('map');

  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => console.log('[PWA] Service Worker activo:', reg.scope))
      .catch((err) => console.warn('[PWA] Service Worker no registrado:', err));
  }

  // Elementos DOM - Encabezado y Estado
  const appStatusPill = document.getElementById('app-status-pill');
  const statusText = document.getElementById('status-text');
  const heartbeatBadge = document.getElementById('heartbeat-badge');
  const connectedCount = document.getElementById('connected-count');

  // Elementos DOM - Botones Flotantes (FABs)
  const btnLocateMe = document.getElementById('btn-locate-me');
  const btnToggleEngine = document.getElementById('btn-toggle-engine');
  const btnClearTrail = document.getElementById('btn-clear-trail');

  // Elementos DOM - Bottom Sheet Ergonómico
  const bottomSheet = document.getElementById('mobile-bottom-sheet');
  const sheetHandle = document.getElementById('sheet-handle');
  const sheetDragTitle = document.getElementById('sheet-drag-title');
  const btnToggleTracking = document.getElementById('btn-toggle-tracking');
  const userSelectDropdown = document.getElementById('user-select-dropdown');
  const btnFitAll = document.getElementById('btn-fit-all');
  const btnSimToggle = document.getElementById('btn-sim-toggle');
  const connectedUsersChips = document.getElementById('connected-users-chips');

  // Telemetría Rápida (Compacta)
  const quickSpeed = document.getElementById('quick-speed');
  const quickAccuracy = document.getElementById('quick-accuracy');
  const quickBattery = document.getElementById('quick-battery');
  const quickPings = document.getElementById('quick-pings');

  // Telemetría Detallada (Expandida)
  const sensorsCardTitle = document.getElementById('sensors-card-title');
  const detLat = document.getElementById('det-lat');
  const detLng = document.getElementById('det-lng');
  const detAltitude = document.getElementById('det-altitude');
  const detHeading = document.getElementById('det-heading');
  const detDistance = document.getElementById('det-distance');
  const detOrientation = document.getElementById('det-orientation');
  const telemetryTimestamp = document.getElementById('telemetry-timestamp');

  // Elementos DOM - Modal de Ajustes
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const formSettings = document.getElementById('form-settings');
  const inputProjectId = document.getElementById('cfg-project-id');
  const inputApiKey = document.getElementById('cfg-api-key');
  const inputCustomApiUrl = document.getElementById('cfg-custom-api-url');
  const inputGoogleMapsKey = document.getElementById('cfg-google-maps-key');

  // Sincronizar botón de simulación inicial
  syncSimButtonUI();

  // 1. Inicializar Firebase (Proyecto appmovil-67ee7)
  const fbResult = window.FirebaseManager.initFirebase();
  if (fbResult.success) {
    showToast('Firebase conectado (appmovil-67ee7)', 'success');
  }

  // 2. Inicializar Google Maps y comenzar recepción de todos los usuarios cada 1000ms
  await monitor.initMap();

  monitor.callbacks.onHeartbeatTick = () => {
    heartbeatBadge.classList.add('flash');
    setTimeout(() => heartbeatBadge.classList.remove('flash'), 250);
  };

  monitor.callbacks.onDevicesUpdated = (devicesList, selectedId) => {
    const onlineDevices = devicesList.filter((d) => d.isOnline);
    connectedCount.textContent = String(onlineDevices.length);

    if (monitor.isMonitoring) {
      appStatusPill.className = 'status-indicator online';
      statusText.textContent =
        onlineDevices.length > 0
          ? `Monitoreando ${onlineDevices.length} conectados`
          : 'Esperando usuarios en línea...';
    }

    // Actualizar selector desplegable (sin cerrarlo si está enfocado)
    if (document.activeElement !== userSelectDropdown) {
      let optionsHtml = `<option value="ALL">🌐 Ver Todos los Conectados (${devicesList.length})</option>`;
      devicesList.forEach((dev) => {
        const dot = dev.isOnline ? '🟢' : '⚪';
        optionsHtml += `<option value="${escapeHtml(dev.deviceId)}">${dot} ${escapeHtml(dev.alias)} — ${dev.speedKmH.toFixed(1)} km/h</option>`;
      });
      userSelectDropdown.innerHTML = optionsHtml;
      userSelectDropdown.value =
        selectedId === 'ALL' || devicesList.some((d) => d.deviceId === selectedId) ? selectedId : 'ALL';
    }

    // Actualizar chips rápidos horizontales
    let chipsHtml = `
      <button type="button" class="user-pill-chip ${selectedId === 'ALL' ? 'active' : ''}" data-id="ALL">
        <span class="user-pill-dot" style="background: #00f2fe;"></span>
        Todos (${devicesList.length})
      </button>
    `;
    devicesList.forEach((dev) => {
      const isSelected = dev.deviceId === selectedId;
      const dotColor = dev.isOnline ? '#10b981' : '#64748b';
      chipsHtml += `
        <button type="button" class="user-pill-chip ${isSelected ? 'active' : ''}" data-id="${escapeHtml(dev.deviceId)}">
          <span class="user-pill-dot" style="background: ${dotColor};"></span>
          ${escapeHtml(dev.alias)}
        </button>
      `;
    });
    connectedUsersChips.innerHTML = chipsHtml;
    connectedUsersChips.querySelectorAll('.user-pill-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        monitor.selectDevice(id, true);
      });
    });

    // Actualizar panel de telemetría con el usuario seleccionado (o el primero activo si está en ALL)
    updateTelemetryPanel(devicesList, selectedId);
  };

  monitor.startMonitoringAllUsers();

  // -------------------------------------------------------------------------
  // 3. SELECTOR DE USUARIOS Y BOTONES FLOTANTES (FABs)
  // -------------------------------------------------------------------------
  userSelectDropdown.addEventListener('change', (e) => {
    monitor.selectDevice(e.target.value, true);
  });

  btnFitAll.addEventListener('click', () => {
    monitor.selectDevice('ALL', true);
    showToast('Vista ajustada a todos los usuarios conectados', 'info');
  });

  btnSimToggle.addEventListener('click', () => {
    monitor.setSimulationEnabled(!monitor.simulationEnabled);
    syncSimButtonUI();
    showToast(
      monitor.simulationEnabled
        ? 'Usuarios de demostración activados en Google Maps'
        : 'Mostrando únicamente dispositivos reales de Firebase / API',
      'info'
    );
  });

  function syncSimButtonUI() {
    btnSimToggle.classList.toggle('active', monitor.simulationEnabled);
    btnSimToggle.innerHTML = monitor.simulationEnabled
      ? '<i class="fas fa-vial"></i> Demo Activa'
      : '<i class="fas fa-vial"></i> Solo Reales';
  }

  btnLocateMe.addEventListener('click', () => {
    if (monitor.selectedDeviceId !== 'ALL') {
      monitor.selectDevice(monitor.selectedDeviceId, true);
      showToast('Centrado en el usuario seleccionado', 'info');
    } else {
      monitor.fitAllDevicesBounds();
      showToast('Encuadrando a todos los usuarios conectados', 'info');
    }
  });

  btnToggleEngine.addEventListener('click', () => {
    const styleName = monitor.cycleTileStyle();
    if (styleName) {
      showToast(`🗺️ Capa de mapa: ${styleName}`, 'info');
    }
  });

  btnClearTrail.addEventListener('click', () => {
    monitor.clearAllPaths();
    detDistance.textContent = '0 m';
    showToast('Rastro de rutas limpiado', 'info');
  });

  // -------------------------------------------------------------------------
  // 4. DESPLIEGUE DEL BOTTOM SHEET ERGONÓMICO
  // -------------------------------------------------------------------------
  sheetHandle.addEventListener('click', () => {
    const isCollapsed = bottomSheet.classList.contains('collapsed');
    if (isCollapsed) {
      bottomSheet.classList.remove('collapsed');
      bottomSheet.classList.add('expanded');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-down"></i> Toca para minimizar';
    } else {
      bottomSheet.classList.remove('expanded');
      bottomSheet.classList.add('collapsed');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-up"></i> Toca para ver sensores del usuario';
    }
  });

  // -------------------------------------------------------------------------
  // 5. PAUSAR / REANUDAR MONITOREO EN TIEMPO REAL (1000 ms)
  // -------------------------------------------------------------------------
  btnToggleTracking.addEventListener('click', () => {
    if (monitor.isMonitoring) {
      monitor.stopMonitoringAllUsers();
      btnToggleTracking.classList.add('paused-monitoring');
      btnToggleTracking.innerHTML = '<i class="fas fa-play-circle"></i> <span>Reanudar Monitoreo GPS (1000ms)</span>';
      appStatusPill.className = 'status-indicator locating';
      statusText.textContent = 'Monitoreo en Pausa';
      heartbeatBadge.classList.remove('active');
      showToast('Recepción en pausa', 'warning');
    } else {
      monitor.startMonitoringAllUsers();
      btnToggleTracking.classList.remove('paused-monitoring');
      btnToggleTracking.innerHTML = '<i class="fas fa-satellite-dish"></i> <span>Monitoreando GPS en Vivo (1000ms)</span>';
      appStatusPill.className = 'status-indicator online';
      statusText.textContent = 'Escuchando usuarios (1000ms)...';
      heartbeatBadge.classList.add('active');
      showToast('📡 Monitoreo en tiempo real reanudado (1000ms)', 'success');
    }
  });

  // -------------------------------------------------------------------------
  // 6. ACTUALIZACIÓN DE TARJETAS DE TELEMETRÍA Y SENSORES
  // -------------------------------------------------------------------------
  function updateTelemetryPanel(devicesList, selectedId) {
    if (!devicesList || devicesList.length === 0) {
      sensorsCardTitle.textContent = 'Sensores del Teléfono (Sin usuarios)';
      quickSpeed.textContent = '0.0 km/h';
      quickAccuracy.textContent = '-- m';
      quickBattery.textContent = '--%';
      quickPings.textContent = '0';
      detLat.textContent = '--.------';
      detLng.textContent = '--.------';
      detAltitude.textContent = '-- m';
      detHeading.textContent = '--';
      detDistance.textContent = '0 m';
      detOrientation.textContent = '--';
      return;
    }

    const target =
      selectedId === 'ALL'
        ? devicesList[0]
        : devicesList.find((d) => d.deviceId === selectedId) || devicesList[0];

    const totalPingsAll = devicesList.reduce((acc, d) => acc + (d.pingsSent || 0), 0);

    sensorsCardTitle.textContent =
      selectedId === 'ALL'
        ? `Sensores: ${target.alias}`
        : `Sensores: ${target.alias}`;

    quickSpeed.textContent = `${Number(target.speedKmH || 0).toFixed(1)} km/h`;
    quickAccuracy.textContent = target.accuracy ? `±${Math.round(target.accuracy)}m` : '-- m';
    quickBattery.textContent = target.batteryLevel !== null && target.batteryLevel !== undefined ? `${target.batteryLevel}%` : '--%';
    quickPings.textContent = selectedId === 'ALL' ? String(totalPingsAll) : String(target.pingsSent || 0);

    detLat.textContent = Number(target.latitude).toFixed(6);
    detLng.textContent = Number(target.longitude).toFixed(6);
    detAltitude.textContent = target.altitude !== null && target.altitude !== undefined ? `${Math.round(target.altitude)} m` : '-- m';
    detHeading.textContent =
      target.heading !== null && target.heading !== undefined
        ? `${Math.round(target.heading)}° (${formatHeadingToCardinal(target.heading)})`
        : '--';

    const dist = target.totalDistanceMeters || 0;
    detDistance.textContent = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;

    if (target.orientation && target.orientation.alpha !== null && target.orientation.alpha !== undefined) {
      detOrientation.textContent = `α:${target.orientation.alpha}° β:${target.orientation.beta}° γ:${target.orientation.gamma}°`;
    } else {
      detOrientation.textContent = '--';
    }

    telemetryTimestamp.textContent = new Date(target.updatedAtEpoch || Date.now()).toLocaleTimeString();
  }

  // -------------------------------------------------------------------------
  // 7. MODAL DE AJUSTES
  // -------------------------------------------------------------------------
  btnOpenSettings.addEventListener('click', () => {
    const curCfg = window.FirebaseManager.getActiveFirebaseConfig();
    inputProjectId.value = curCfg.projectId;
    inputApiKey.value = curCfg.apiKey;
    inputCustomApiUrl.value = monitor.customApiUrl || '';
    inputGoogleMapsKey.value = monitor.googleMapsApiKey || '';
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const savedCfg = window.FirebaseManager.saveFirebaseConfig({
      projectId: inputProjectId.value,
      apiKey: inputApiKey.value
    });
    window.FirebaseManager.initFirebase(savedCfg);

    monitor.setCustomApiUrl(inputCustomApiUrl.value);

    const gKey = inputGoogleMapsKey.value.trim();
    if (gKey) {
      await monitor.setEngine('google', gKey);
    } else {
      await monitor.setEngine('leaflet', '');
    }

    if (monitor.isMonitoring) {
      monitor.startFirestoreCollectionListener();
    }
    settingsModal.classList.add('hidden');
    showToast('Ajustes de monitoreo guardados correctamente', 'success');
  });

  function formatHeadingToCardinal(deg) {
    if (deg === null || deg === undefined) return '--';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return directions[idx];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  }
});
