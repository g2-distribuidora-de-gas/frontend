export type EstadoRuta = 'PLANIFICADA' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA';
export type EstadoEntrega = 'PENDIENTE' | 'ENTREGADO' | 'FALLIDO';

export const ESTADO_RUTA_LABELS: Record<EstadoRuta, string> = {
  PLANIFICADA: 'Planificada',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
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
}
