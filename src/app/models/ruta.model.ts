import type { EstadoPedido } from './pedido.model';

export type EstadoRuta = 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA' | 'REPROGRAMADA';
export type EstadoEntrega = 'PENDIENTE' | 'ENTREGADO' | 'FALLIDO';

export const ESTADO_RUTA_LABELS: Record<EstadoRuta, string> = {
  PLANIFICADA: 'Planificada',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  REPROGRAMADA: 'Reprogramada',
};

export const ESTADO_ENTREGA_LABELS: Record<EstadoEntrega, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  FALLIDO: 'Fallido',
};

export interface RutaClienteResponse {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string;
  latitud?: number | null;
  longitud?: number | null;
}

export interface RutaPedidoResponse {
  id: number;
  pedidoId: number;
  cliente: RutaClienteResponse | null;
  orden: number;
  distanciaDesdeAnteriorM?: number | null;
  duracionDesdeAnteriorS?: number | null;
  estadoEntrega: EstadoEntrega;
  motivoFallo?: string | null;
}

export interface DetalleEntregaRequest {
  pedidoDetalleId: number;
  cantidadEntregada: number;
}
export interface ActualizarParadaRequest {
  nuevoEstado: EstadoEntrega;
  motivoFallo?: string;
  entregas?: DetalleEntregaRequest[];
}


export interface RutaResponse {
  id: number;
  fechaReparto: string;
  repartidorId: number;
  origenLat?: number | null;
  origenLng?: number | null;
  distanciaTotalM?: number | null;
  duracionTotalS?: number | null;
  geometria?: string | null;
  estado: EstadoRuta;
  paradas: RutaPedidoResponse[];
}

export interface RutaPlanificarRequest {
  repartidorId: number;
  pedidosIds: number[];
  fechaReparto?: string;
}


export interface DeliveryDetalleResponse {
  id: number;
  tipoGarrafaId: number;
  garrafaTipo: string;
  cantidad: number;
  cantidadEntregada?: number | null;
  precioUnitario: number;
  subtotal: number;
}

export interface DeliveryReadOnlyResponse {
  pedidoId: number;
  uuidOffline?: string | null;
  estado: EstadoPedido;
  cliente: RutaClienteResponse | null;
  detalles: DeliveryDetalleResponse[];
  parada?: unknown;
}


export interface ParadaDetalleOffline {
  garrafaTipo: string;
  cantidad: number;
  precioUnitario?: number;
  subtotal?: number;
}


export interface RutaPedidoOffline extends RutaPedidoResponse {
  pendiente?: boolean;
  estadoPedido?: EstadoPedido | null;
  totalPedido?: number | null;
  detalles?: ParadaDetalleOffline[];
}

export interface RutaOfflineView extends Omit<RutaResponse, 'paradas'> {
  paradas: RutaPedidoOffline[];
  pendiente?: boolean;
}


export interface SincronizacionParadaItem {
  rutaPedidoId: number;
  uuidOffline: string;
  nuevoEstado: EstadoEntrega;
  motivoFallo?: string;
}

export interface SincronizacionParadasRequest {
  paradas: SincronizacionParadaItem[];
}

export interface SincronizacionParadasResponse {
  procesados: { uuidOffline: string; rutaPedidoId: number }[];
  errores: { uuidOffline: string; rutaPedidoId: number; error: string }[];
}

export interface SincronizacionRutaItem {
  rutaId: number;
  uuidOffline: string;
  nuevoEstado: EstadoRuta;
}

export interface SincronizacionRutasRequest {
  cambios: SincronizacionRutaItem[];
}

export interface SincronizacionRutasResponse {
  procesados: { uuidOffline: string; rutaId: number }[];
  errores: { uuidOffline: string; rutaId: number; error: string }[];
}

// ── Agenda ─────────────────────────────────────────────────────────────────

export type ConfirmacionRepartidor = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';

export const CONFIRMACION_LABELS: Record<ConfirmacionRepartidor, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'Confirmado',
  RECHAZADO: 'Rechazado',
};

/** Respuesta del endpoint GET /api/rutas/agenda/{repartidorId} */
export interface AgendaRepartidorResponse {
  rutaId: number;
  repartidorId: number;
  fechaReparto: string;
  estado: EstadoRuta;
  cantidadParadas: number;
  paradasEntregadas: number;
  paradasFallidas: number;
  paradasPendientes: number;
  notasAdmin: string | null;
  confirmacionRepartidor: ConfirmacionRepartidor;
  distanciaTotalM: number | null;
  duracionTotalS: number | null;
}

/** Body de PATCH /api/rutas/{rutaId}/confirmar */
export interface ConfirmarTurnoRequest {
  confirmacion: ConfirmacionRepartidor;
  motivoRechazo?: string;
}

/** Body de PATCH /api/rutas/{rutaId}/notas-admin */
export interface ActualizarNotasAdminRequest {
  notasAdmin: string | null;
}

/** Payload que llega por WebSocket /user/queue/agenda */
export interface AgendaNotificacion {
  tipo: 'NUEVA_RUTA_ASIGNADA' | 'RUTA_CANCELADA' | 'NOTAS_ACTUALIZADAS';
  rutaId: number;
  fechaReparto: string;
  repartidorId: number;
  mensaje: string;
  timestamp: string;
}
