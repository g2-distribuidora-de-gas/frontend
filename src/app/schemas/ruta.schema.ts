import { RxJsonSchema } from 'rxdb';

export const rutaSchemaLiteral = {
  title: 'ruta schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    repartidorId: { type: 'number' },
    fechaReparto: { type: 'string' },
    origenLat: { type: ['number', 'null'] },
    origenLng: { type: ['number', 'null'] },
    distanciaTotalM: { type: ['number', 'null'] },
    duracionTotalS: { type: ['number', 'null'] },
    geometria: { type: ['string', 'null'] },
    estado: { type: 'string', maxLength: 20 },
    paradas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          pedidoId: { type: 'number' },
          orden: { type: 'number' },
          distanciaDesdeAnteriorM: { type: ['number', 'null'] },
          duracionDesdeAnteriorS: { type: ['number', 'null'] },
          estadoEntrega: { type: 'string', maxLength: 20 },
          motivoFallo: { type: ['string', 'null'] },
          estadoPedido: { type: ['string', 'null'], maxLength: 20 },
          totalPedido: { type: ['number', 'null'] },
          cliente: {
            type: ['object', 'null'],
            properties: {
              id: { type: 'number' },
              nombre: { type: 'string' },
              telefono: { type: ['string', 'null'] },
              direccion: { type: 'string' },
              latitud: { type: ['number', 'null'] },
              longitud: { type: ['number', 'null'] },
            },
          },
          detalles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                garrafaTipo: { type: 'string' },
                cantidad: { type: 'number' },
                precioUnitario: { type: 'number' },
                subtotal: { type: 'number' },
              },
              required: ['garrafaTipo', 'cantidad'],
            },
          },
        },
        required: ['id', 'pedidoId', 'orden', 'estadoEntrega'],
      },
    },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'repartidorId', 'estado', 'paradas', 'updatedAt'],
  indexes: ['updatedAt'],
} as const;

export interface RutaClienteCache {
  id?: number;
  nombre?: string;
  telefono?: string | null;
  direccion?: string;
  latitud?: number | null;
  longitud?: number | null;
}

export interface ParadaDetalleCache {
  garrafaTipo: string;
  cantidad: number;
  precioUnitario?: number;
  subtotal?: number;
}

export interface RutaParadaCache {
  id: number;
  pedidoId: number;
  orden: number;
  distanciaDesdeAnteriorM?: number | null;
  duracionDesdeAnteriorS?: number | null;
  estadoEntrega: string;
  motivoFallo?: string | null;
  estadoPedido?: string | null;
  totalPedido?: number | null;
  cliente?: RutaClienteCache | null;
  detalles?: ParadaDetalleCache[];
}

export interface RutaDocType {
  id: string;
  repartidorId: number;
  fechaReparto: string;
  origenLat?: number | null;
  origenLng?: number | null;
  distanciaTotalM?: number | null;
  duracionTotalS?: number | null;
  geometria?: string | null;
  estado: string;
  paradas: RutaParadaCache[];
  updatedAt: string;
}

export const rutaSchema: RxJsonSchema<RutaDocType> = rutaSchemaLiteral as unknown as RxJsonSchema<RutaDocType>;
