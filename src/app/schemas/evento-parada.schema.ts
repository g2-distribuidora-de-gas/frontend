import { RxJsonSchema } from 'rxdb';


export const eventoParadaSchemaLiteral = {
  title: 'evento parada schema',
  version: 0,
  primaryKey: 'uuidOffline',
  type: 'object',
  properties: {
    uuidOffline: { type: 'string', maxLength: 36 },
    rutaPedidoId: { type: 'number' },
    nuevoEstado: { type: 'string', maxLength: 20 },
    motivoFallo: { type: 'string' },
    sincronizado: { type: 'boolean' },
    createdAt: { type: 'string', maxLength: 50 },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['uuidOffline', 'rutaPedidoId', 'nuevoEstado', 'sincronizado', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt', 'sincronizado'],
} as const;

export interface EventoParadaDocType {
  uuidOffline: string;
  rutaPedidoId: number;
  nuevoEstado: string;
  motivoFallo?: string;
  sincronizado: boolean;
  createdAt: string;
  updatedAt: string;
}

export const eventoParadaSchema: RxJsonSchema<EventoParadaDocType> =
  eventoParadaSchemaLiteral as unknown as RxJsonSchema<EventoParadaDocType>;