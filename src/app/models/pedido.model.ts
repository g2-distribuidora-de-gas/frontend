import type { Cliente } from './cliente.model';
import type { Garrafa } from './garrafa.model';

/** Estados alineados con el enum EstadoPedido del backend */
export type EstadoPedido = 'PENDIENTE' | 'EN_PROCESO' | 'ENTREGADO' | 'CANCELADO' | 'REPROGRAMADO';

/** Labels legibles para la UI */
export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  REPROGRAMADO: 'Reprogramado',
};

/** Detalle de pedido embebido dentro del documento Pedido */
export interface DetallePedido {
  tipoGarrafaId: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Modelo local (RxDB) para pedido — offline-first */
export interface Pedido {
  uuidOffline: string;
  backendId?: number;
  creadorId?: number;
  clienteId: string;
  direccionEntrega: string;
  estado: EstadoPedido;
  urlFotoEvidencia?: string;
  total: number;
  observaciones: string;
  sincronizado: boolean;
  detalles: DetallePedido[];
  updatedAt: string;
}

/** Modelo enriquecido para la UI — con datos resueltos de las relaciones */
export interface PedidoCompleto extends Pedido {
  cliente?: Cliente;
  detallesResueltos: (DetallePedido & { garrafa?: Garrafa })[];
}

// ─── DTOs del backend ───

export interface PedidoDetalleRequest {
  tipoGarrafaId: number;
  cantidad: number;
}

export interface PedidoRequest {
  uuidOffline?: string;
  clienteId: number;
  creadorId?: number;
  direccionEntrega: string;
  urlFotoEvidencia?: string;
  detalles: PedidoDetalleRequest[];
}

export interface PedidoDetalleResponse {
  id: number;
  tipoGarrafaId: number;
  garrafaTipo: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PedidoResponse {
  id: number;
  uuidOffline: string;
  clienteId: number;
  clienteNombre: string;
  creadorId?: number;
  creadorNombre?: string;
  direccionEntrega: string;
  estado: EstadoPedido;
  urlFotoEvidencia?: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  detalles: PedidoDetalleResponse[];
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
  totalConsultados: number;
  encontrados: number;
  procesados: string[];
  noEncontrados: string[];
}
