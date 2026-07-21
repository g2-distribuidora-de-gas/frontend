import type { EstadoRuta } from './ruta.model';


export type OrigenCoordenada = 'GPS' | 'NETWORK' | 'MANUAL';


export interface PosicionRepartidorDto {
  rutaId?: number | null;
  latitud: number;
  longitud: number;
  headingGrados?: number | null;
  velocidadMps?: number | null;
  precisionM?: number | null;
  timestampCliente?: string | null;
  origen?: OrigenCoordenada;
}


export interface PosicionBroadcastDto {
  rutaId: number;
  repartidorId: number;
  repartidorNombre: string;
  estadoRuta: EstadoRuta;
  latitud: number;
  longitud: number;
  headingGrados?: number | null;
  velocidadMps?: number | null;
  precisionM?: number | null;
  timestampCliente?: string | null;
  serverTimestamp: string;
  origen?: OrigenCoordenada;
}


export type TipoEventoRuta =
  | 'CAMBIO_ESTADO_RUTA'
  | 'CAMBIO_ESTADO_PARADA'
  | 'RUTA_CANCELADA';

export interface EventoRutaWsDto {
  tipo: TipoEventoRuta;
  rutaId: number;
  repartidorId?: number | null;
  estadoAnterior?: EstadoRuta | null;
  estadoNuevo?: EstadoRuta | null;
  rutaPedidoId?: number | null;
  mensaje?: string | null;
  timestamp: string;
}


export type ErrorWsCodigo =
  | 'NO_AUTH'
  | 'PAYLOAD_VACIO'
  | 'RUTA_ID_REQUERIDO'
  | 'COORDENADAS_REQUERIDAS'
  | 'LATITUD_INVALIDA'
  | 'LONGITUD_INVALIDA'
  | 'TIMESTAMP_MUY_VIEJO'
  | 'TIMESTAMP_MUY_FUTURO'
  | 'RUTA_NO_ENCONTRADA'
  | 'RUTA_NO_PROPIA'
  | 'RUTA_NO_TRANSMITE'
  | 'FORBIDDEN_NOT_REPARTIDOR'
  | 'BAD_REQUEST'
  | 'USUARIO_NO_ENCONTRADO';

export interface ErrorWsDto {
  codigo: ErrorWsCodigo;
  mensaje: string;
  timestamp: string;
}


export const APP_POSICION_TEMPLATE = '/app/rutas/%d/posicion';
export const TOPIC_POSICIONES_TEMPLATE = '/topic/rutas/%d/posiciones';
export const TOPIC_EVENTOS_TEMPLATE = '/topic/rutas/%d/eventos';
export const USER_QUEUE_ERRORS_DESTINATION = '/user/queue/errors';

export function topicPosiciones(rutaId: number): string {
  return TOPIC_POSICIONES_TEMPLATE.replace('%d', String(rutaId));
}

export function topicEventos(rutaId: number): string {
  return TOPIC_EVENTOS_TEMPLATE.replace('%d', String(rutaId));
}

export function appPosicion(rutaId: number): string {
  return APP_POSICION_TEMPLATE.replace('%d', String(rutaId));
}
