# 🛰️ GeoLive Monitor (AppMovilAdmin) — Panel de Monitoreo GPS Multi-Usuario en Tiempo Real

Aplicación web móvil progresiva (PWA) diseñada para **monitorear en tiempo real cada 1000 milisegundos (1 segundo)** la ubicación en **Google Maps** y la telemetría de sensores de **todos los usuarios conectados** desde la aplicación emisora compañera: [`AppMovil`](https://github.com/JJamesrxzn7/AppMovil).

---

## 🎯 Arquitectura y Conexión con `AppMovil`

1. **Fondo Oficial de Google Maps (`mt{s}.google.com/vt/lyrs=m`):**
   - Muestra por defecto el mapa completo de **Google Maps (Calles, Avenidas y Comercios)** sin marcas de agua ni bloqueos.
   - Permite alternar con un toque entre **Google Maps Calles**, **Google Maps Satélite Híbrido (`lyrs=y`)**, **Google Maps Terreno (`lyrs=p`)** y **Google Maps JavaScript API v3**.
2. **Sincronización en Tiempo Real con Firebase Firestore (`appmovil-67ee7`):**
   - Escucha de forma reactiva toda la colección `dispositivos` (`db.collection('dispositivos').onSnapshot(...)`) donde cada móvil conectado escribe su posición cada `1000ms`.
   - Carga automáticamente la subcolección `dispositivos/{deviceId}/historial` para dibujar la polilínea del recorrido de cada usuario sobre Google Maps.
3. **Ciclo de Recepción de 1000 milisegundos (API + Flota en Vivo):**
   - Temporizador sincronizado de `1000ms` con indicador visual de latido (`1000ms`) en la barra superior.
   - Permite conectar adicionalmente un endpoint de API REST externa y cuenta con un modo **Demo Activa** integrado para visualizar múltiples usuarios en movimiento simultáneo por las calles de Google Maps.
4. **Visualización Multi-Usuario y Telemetría de Sensores:**
   - Renderiza en simultáneo los marcadores de radar pulsante, flechas de rumbo rotatorias (`0°–360°`), etiquetas flotantes (`Alias • km/h`), círculos de precisión y estelas de recorrido de todos los usuarios conectados.
   - Permite seleccionar a cualquier usuario (haciendo clic en su marcador en el mapa, en los chips rápidos o en el selector desplegable) para inspeccionar sus sensores en vivo: **Velocidad**, **Precisión**, **Batería %**, **Envíos**, **Latitud**, **Longitud**, **Altitud**, **Rumbo**, **Distancia Recorrida** y **Giroscopio ($\alpha, \beta, \gamma$)**.

