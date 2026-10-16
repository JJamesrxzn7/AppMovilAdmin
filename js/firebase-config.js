/**
 * Configuración y Conexión de Firebase Firestore (DaaS)
 * Proyecto compartido con GeoLive AppMovil: appmovil-67ee7
 * Consola: https://console.firebase.google.com/project/appmovil-67ee7/overview?hl=es-419
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDummyKeyReplaceInSettingsIfRequired",
  authDomain: "appmovil-67ee7.firebaseapp.com",
  projectId: "appmovil-67ee7",
  storageBucket: "appmovil-67ee7.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

const STORAGE_KEYS = {
  FIREBASE_CONFIG: 'gps_app_firebase_config',
  GOOGLE_MAPS_KEY: 'gps_app_google_maps_key',
  CUSTOM_API_URL: 'gps_app_custom_api_url',
  ACTIVE_DEVICE_ID: 'gps_app_device_id',
  MAP_ENGINE: 'gps_app_map_engine',
  SIMULATION_ENABLED: 'gps_app_simulation_enabled'
};

let db = null;
let firebaseApp = null;
let isFirebaseOnline = false;

// Obtiene la configuración activa (desde localStorage o valores predeterminados)
function getActiveFirebaseConfig() {
  const saved = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
  if (saved) {
    try {
      return { ...DEFAULT_FIREBASE_CONFIG, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Error al parsear config de Firebase guardada:', e);
    }
  }
  return { ...DEFAULT_FIREBASE_CONFIG };
}

// Guarda la configuración actualizada en localStorage
function saveFirebaseConfig(newConfig) {
  const cleanConfig = {
    apiKey: (newConfig.apiKey || '').trim() || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: (newConfig.authDomain || '').trim() || `${newConfig.projectId || 'appmovil-67ee7'}.firebaseapp.com`,
    projectId: (newConfig.projectId || 'appmovil-67ee7').trim(),
    storageBucket: (newConfig.storageBucket || '').trim() || `${newConfig.projectId || 'appmovil-67ee7'}.appspot.com`,
    messagingSenderId: (newConfig.messagingSenderId || '').trim() || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: (newConfig.appId || '').trim() || DEFAULT_FIREBASE_CONFIG.appId
  };
  localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(cleanConfig));
  return cleanConfig;
}

// Inicializa Firebase SDK Compat
function initFirebase(config = null) {
  const currentConfig = config || getActiveFirebaseConfig();

  if (typeof firebase === 'undefined') {
    console.error('El SDK de Firebase no está cargado en la página.');
    return { success: false, error: 'SDK de Firebase no disponible' };
  }

  try {
    if (firebase.apps && firebase.apps.length > 0) {
      firebaseApp = firebase.app();
    } else {
      firebaseApp = firebase.initializeApp(currentConfig);
    }

    db = firebase.firestore();

    try {
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    } catch (_) {
      // Ignorar si ya está inicializado
    }

    isFirebaseOnline = true;
    console.log('Firebase Firestore inicializado exitosamente para:', currentConfig.projectId);
    return { success: true, db, app: firebaseApp };
  } catch (err) {
    console.error('Error al inicializar Firebase:', err);
    isFirebaseOnline = false;
    return { success: false, error: err.message };
  }
}

// Obtiene la instancia activa de Firestore
function getFirestoreDb() {
  if (!db) {
    initFirebase();
  }
  return db;
}

function isConnectedToFirebase() {
  return isFirebaseOnline && db !== null;
}

window.FirebaseManager = {
  STORAGE_KEYS,
  DEFAULT_FIREBASE_CONFIG,
  getActiveFirebaseConfig,
  saveFirebaseConfig,
  initFirebase,
  getFirestoreDb,
  isConnectedToFirebase
};

