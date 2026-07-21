# Distribuidora de Gas · Frontend PWA Offline-First

Aplicación de frontend Angular para la **toma de pedidos** y vista de **listado de pedidos**, con un fuerte enfoque **offline-first** impulsado por **RxDB** y Angular Service Worker.

## Stack Tecnológico

- **Angular 22** (standalone components, signals, zoneless, app inicializer)
- **Tailwind CSS v4** (paleta amarilla personalizada `brand`)
- **RxDB** (Base de datos local reactiva con soporte robusto de replicación, adapter basado en Dexie)
- **@angular/service-worker** (PWA, cache de red offline)

## Instalación y ejecución local

```bash
npm install
npm start          # Desarrollo en http://localhost:4200
```
*(Nota: En modo desarrollo, RxDB tiene activado el `RxDBDevModePlugin` junto con la validación de esquemas `ajv` para advertir sobre inconsistencias en la estructura de los datos).*

### Probar el modo offline

El service worker solo se habilita en el build de producción para cachear los estáticos:

```bash
npm run build
npx http-server dist/ui-distribuidora-gas/browser -p 8080
```

Si abrís `http://localhost:8080`, navegás la app una vez y cortás la red (DevTools → Network → Offline), la app seguirá cargando y los pedidos se guardarán localmente en RxDB, quedando a la espera de recuperar conexión para el push.

---

## Arquitectura de Replicación (RxDB)

La aplicación utiliza un patrón **Offline-First**. Toda interacción de la interfaz de usuario ocurre exclusivamente contra la base de datos local `rxdb`. El servicio de replicación (`ReplicationService`) se encarga en segundo plano de sincronizar esos cambios mediante un sistema *Pull-Push* con el backend.

### ⚠️ Requisitos Obligatorios del Backend (Spring Boot)

Para que el motor de sincronización de RxDB no descargue toda la base de datos constantemente y utilice correctamente los **Checkpoints** (sincronización delta), el backend **DEBE** adaptarse con los siguientes requerimientos:

#### 1. Campos obligatorios en Base de Datos (PostgreSQL)
Todas las tablas que se replican (`usuarios`, `garrafas`, `pedidos`) deben tener un campo que registre la fecha de su última mutación:
- **`updated_at` (Timestamp/Datetime):** Debe actualizarse de forma automática y estricta en cada operación `INSERT` o `UPDATE`.
- Es recomendable soportar bajas lógicas (ej. un boolean `deleted` o `activo`) en lugar de `DELETE` físico, para que el frontend se entere de que un registro dejó de existir.

#### 2. Endpoints de Lectura (GET) adaptados
Los endpoints `GET /api/usuarios`, `GET /api/garrafas` y `GET /api/pedidos` deben recibir parámetros de paginación para el mecanismo de Pull:
- `minUpdatedAt`: Fecha a partir de la cual consultar los cambios.
- `limit`: Límite máximo de registros a retornar por petición.

La consulta SQL / JPQL debe estructurarse conceptualmente así:
```sql
SELECT * FROM tabla
WHERE updated_at > :minUpdatedAt
ORDER BY updated_at ASC, id ASC
LIMIT :limit
```
*(El doble sort de `updated_at` y luego `id` previene condiciones de carrera si dos registros mutan en el exacto mismo milisegundo).*

#### 3. Inclusión de Fechas en los DTOs (JSON)
El backend **debe** exponer el campo modificado en los JSON de respuesta de todos los listados:
```json
{
  "id": 1,
  "nombre": "Ejemplo",
  "updatedAt": "2026-07-04T19:50:00Z"
}
```

#### 4. Sincronización Bidireccional de Pedidos (Push)
El endpoint que recibe datos nuevos (`POST /api/sincronizar`) debe asegurar que los registros insertados tomen el `updated_at` generado por el servidor en el momento de procesarlos. 

---

## Estructura del Proyecto

```
src/app/
├── models/                 # Interfaces DTO compatibles con el backend
├── schemas/                # Esquemas JSON estrictos requeridos por RxDB
├── services/
│   ├── rx-database.service.ts # Inicialización de base de datos local 
│   ├── replication.service.ts # Motor de replicación Push/Pull automático
│   ├── api-*.service.ts       # Comunicación HTTP directa con Spring Boot
│   ├── catalogo.service.ts    # Capa de dominio (Usuarios/Garrafas)
│   ├── realtime.service.ts    # Cliente STOMP/SockJS para tracking GPS en vivo
│   ├── tracking-repartidor.service.ts # WatchPosition + throttle 1s
│   └── pedido.service.ts      # Capa de dominio (Transacciones offline)
└── pages/
    ├── toma-pedido/        # Vista para cargar nuevos pedidos
    ├── pedidos/            # Listado de estados y pedidos registrados
    ├── reparto/           # Vista del repartidor con botón "Iniciar tracking GPS"
    └── admin/rutas/       # Planificación de rutas + overlay de tracking en vivo
```

---

## Tracking GPS en vivo (STOMP / WebSocket)

El panel admin puede ver la posición del repartidor en vivo sobre el mapa, y la
app del repartidor publica su GPS desde el navegador usando la **Geolocation API**.
El transporte es **STOMP sobre SockJS** contra el endpoint `/ws?token=<jwt>` del
backend (ver `backend/docs/WEBSOCKETS_FRONTEND.md` para el contrato completo).

### Stack

- `@stomp/stompjs` v7 — cliente STOMP.
- `sockjs-client` v1.6 — transporte SockJS con fallback xhr-streaming/long-polling.
- Leaflet (OSM) — render del mapa con marker en vivo.

### Servicios nuevos

- `RealtimeService` (`src/app/services/realtime.service.ts`):
  singleton que envuelve `@stomp/stompjs`. Métodos: `conectar(jwt)`,
  `desconectar()`, `suscribirseAPosiciones(rutaId, cb)`,
  `suscribirseAEventos(rutaId, cb)`, `suscribirseAErrores(cb)`,
  `publicarPosicion(rutaId, pos)`. Exposes: `conectado$`, `errores$`.
  Reconexión automática cada 5s, heartbeat 10s, throttle de 1 mensaje/seg
  para `publicarPosicion`, re-suscripción de los topics tras `onConnect`.
- `TrackingRepartidorService` (`src/app/services/tracking-repartidor.service.ts`):
  orquesta `navigator.geolocation.watchPosition` y reenvía cada muestra al
  `RealtimeService.publicarPosicion`. Adapta `enableHighAccuracy` y `maximumAge`
  según `document.visibilityState` (precisión alta en foreground, baja en
  background) para cuidar la batería.
- `realtime.tokens.ts`: factories por defecto (`STOMP_WEBSOCKET_FACTORY` →
  `SockJS`, `STOMP_CLIENT_FACTORY` → `Client` con la config de heartbeat).
  En tests se reemplazan por un `ClienteStub` sin tocar SockJS ni stompjs.

### Componentes nuevos

- `MapaRutaLive` (`src/app/components/mapa-ruta-live/`): dibuja la ruta
  planificada + un marker azul en vivo con la posición del repartidor y un
  trail (polyline) del recorrido. Muestra una pastilla con la edad de la
  última muestra (alerta si pasa 30s sin updates) y el código de error
  si llega un `ErrorWsDto`.

### Dónde se usa

- **Repartidor** → `pages/reparto/`: botón **"Iniciar tracking GPS"** visible
  sólo cuando la ruta está en `PLANIFICADA` o `EN_CURSO`. Al activarlo se
  conecta al STOMP y empieza a publicar lat/lng/heading/velocidad. Al
  finalizar o cancelar la ruta, se detiene y se desuscribe.
- **Admin / Super Admin** → `pages/admin/rutas/`: en la card de la ruta recién
  planificada (o en cualquier ruta expandible en estado activo), se renderiza
  el `<app-mapa-ruta-live>` con la suscripción al topic
  `/topic/rutas/{id}/posiciones`.
- **Header global** (`app.html`): pill adicional `STOMP conectado / sin WS`
  junto al `En línea / Sin conexión`, alimentado por `realtime.conectado$`.

### Cómo probarlo con dos navegadores

1. Levantar backend y frontend (`npm start` + Spring Boot).
2. **Pestaña 1** — login como **REPARTIDOR**, abrir `/reparto`. Iniciar
   una ruta, pulsar **Iniciar tracking GPS** y permitir geolocalización.
3. **Pestaña 2** — login como **ADMIN** o **SUPER_ADMIN**, abrir
   `/admin/rutas`, planificar una ruta o expandir una ya activa.
4. Verificar que:
   - El marker azul aparece y se mueve siguiendo al repartidor.
   - Al cancelar/finalizar la ruta el marker desaparece.
   - Si en `/reparto` se rechaza el permiso de geolocalización, sale un
     toast y el botón queda inactivo.
5. Para simular otro cliente publicando, se puede usar `wscat`/`websocat`
   (ejemplo en `backend/docs/WEBSOCKETS_FRONTEND.md` §11).

### Tests

`npx ng test --watch=false` corre Vitest. El spec
`src/app/services/realtime.service.spec.ts` mockea `Client` vía el token
`STOMP_CLIENT_FACTORY` y cubre:

- Creación del cliente STOMP y `activate()`.
- `conectado$` emite `true` en `onConnect`, `false` en `onDisconnect` /
  `onWebSocketClose`.
- `publicarPosicion` aplica throttle de 1s por ruta y adjunta `rutaId` al
  payload.
- `desconectar` desuscribe y desactiva; reconectar con el mismo token no
  recrea el cliente.
- `suscribirseAErrores` parsea y propaga `ErrorWsDto`.

### Garantías de no romper funcionalidades vigentes

- Los interceptores HTTP (`auth`, `baseUrl`, `api-response`) **no se tocan**.
  El WS usa su propio token desde `AuthService.token`.
- `ngsw-config.json` no cambia: `@stomp/stompjs` y `sockjs-client` entran por
  la regla `app` (`/*.js` prefetch) del service worker.
- `RxDatabaseService`, `ReplicationService` y `RepartoOfflineService` siguen
  manejando el flujo offline. El WS se activa sólo con `navigator.onLine`.
- El componente `mapa-ruta` se mantiene intacto. `mapa-ruta-live` es
  paralelo, se compone aditivamente en las cards de `/admin/rutas`.
- `provideAppInitializer` no se altera, por lo que la inicialización de
  RxDB y replicación se ejecuta igual que antes.

