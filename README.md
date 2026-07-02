# Distribuidora de Gas · Toma de pedidos (PWA offline)

Prueba técnica de frontend: vista de **toma de pedidos** y vista de **listado de pedidos**, con funcionamiento **offline** usando IndexedDB (Dexie.js) y Angular Service Worker.

## Stack

- Angular 22 (standalone components, signals, zoneless)
- Tailwind CSS v4 (paleta amarillo suave personalizada `brand`)
- Dexie.js v4 (IndexedDB)
- @angular/service-worker (PWA, cache offline)

## Instalación y ejecución

```bash
npm install
npm start          # desarrollo en http://localhost:4200 (SW deshabilitado en dev)
```

### Probar el modo offline

El service worker solo se habilita en build de producción:

```bash
npm run build
npx http-server dist/ui-distribuidora-gas/browser -p 8080
```

Abrir http://localhost:8080, navegar una vez y luego cortar la red (DevTools → Network → Offline). La app sigue funcionando: los pedidos se guardan en IndexedDB.

## Estructura

```
src/app/
├── models/                 # Interfaces según el esquema de BD
│   ├── cliente.model.ts
│   ├── producto.model.ts
│   └── pedido.model.ts     # Pedido, DetallePedido, EstadoPedido, PedidoCompleto
├── services/
│   ├── db.service.ts       # Dexie: esquema, tablas y seed de datos de prueba
│   ├── catalogo.service.ts # Productos y clientes activos
│   └── pedido.service.ts   # Crear pedido (transacción), listar con relaciones, cambiar estado
└── pages/
    ├── toma-pedido/        # Vista de toma de pedidos
    └── pedidos/            # Vista de listado de pedidos
```

## Notas

- Se quitó el SSR del scaffold original: para una PWA offline con IndexedDB no aporta y complica el service worker.
- El diagrama de `detalles_pedidos` no mostraba la FK al producto; se agregó `id_producto` (necesaria para reconstruir el pedido).
- `estado_id` es uuid: se creó la tabla `estados_pedido` con estados fijos (Pendiente, En camino, Entregado, Cancelado) sembrados en el seed.
- Datos de ejemplo (productos y clientes) se cargan automáticamente la primera vez que se abre la app (`on('populate')` de Dexie).
