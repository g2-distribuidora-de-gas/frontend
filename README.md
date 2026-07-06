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
│   └── pedido.service.ts      # Capa de dominio (Transacciones offline)
└── pages/
    ├── toma-pedido/        # Vista para cargar nuevos pedidos
    └── pedidos/            # Listado de estados y pedidos registrados
```
