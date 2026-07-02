import type { Garrafa, GarrafaResponse } from './garrafa.model';
import type { Usuario, UsuarioResponse } from './usuario.model';

/** Estados alineados con el enum EstadoPedido del backend */
export type EstadoPedido = 'PENDIENTE' | 'EN_PROCESO' | 'ENTREGADO' | 'CANCELADO';

/** Labels legibles para la UI */
export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

/** Modelo local (Dexie) para pedido — offline-first */
export interface Pedido {
  id?: number;
  uuidOffline: string;
  created_at: string;
  usuarioId: number;
  direccionEntrega: string;
  estado: EstadoPedido;
  total: number;
  observaciones: string;
  /** true cuando fue sincronizado exitosamente con el backend */
  sincronizado: boolean;
  /** ID asignado por el backend tras la sincronización */
  backendId?: number;
}

/** Modelo local (Dexie) para detalle de pedido */
export interface DetallePedido {
  id?: number;
  created_at: string;
  pedidoUuid: string;
  garrafaId: number;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

// ─── DTOs del backend ───

export interface PedidoDetalleRequest {
  garrafaId: number;
  cantidad: number;
}

export interface PedidoRequest {
  uuidOffline?: string;
  usuarioId: number;
  direccionEntrega: string;
  detalles: PedidoDetalleRequest[];
}

export interface PedidoDetalleResponse {
  id: number;
  garrafaId: number;
  garrafaTipo: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoResponse {
  id: number;
  uuidOffline: string;
  usuarioId: number;
  usuarioNombreCompleto: string;
  direccionEntrega: string;
  estado: EstadoPedido;
  total: number;
  createdAt: string;
  updatedAt: string;
  detalles: PedidoDetalleResponse[];
}

/** Modelo enriquecido para la UI — con datos resueltos de las relaciones */
export interface PedidoCompleto extends Pedido {
  usuario?: Usuario;
  detalles: (DetallePedido & { garrafa?: Garrafa })[];
}

// ─── DTOs de sincronización ───

export interface SincronizacionRequest {
  pedidos: PedidoRequest[];
}

export interface SincronizacionProcesado {
  uuidOffline: string;
  pedidoId: number;
}

export interface SincronizacionError {
  uuidOffline: string;
  motivo: string;
}

export interface SincronizacionResponse {
  total: number;
  servidorFecha: string;
  procesados: SincronizacionProcesado[];
  duplicados: string[];
  errores: SincronizacionError[];
}

export interface SincronizacionEstadoResponse {
  encontrados: string[];
  noEncontrados: string[];
}
