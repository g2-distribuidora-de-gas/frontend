import { RxJsonSchema } from 'rxdb';


export const eventoRutaSchemaLiteral = {
  title: 'evento ruta schema',
  version: 0,
  primaryKey: 'uuidOffline',
  type: 'object',
  properties: {
    uuidOffline: { type: 'string', maxLength: 36 },
    rutaId: { type: 'number' },
    nuevoEstado: { type: 'string', maxLength: 20 },
    sincronizado: { type: 'boolean' },
    createdAt: { type: 'string', maxLength: 50 },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['uuidOffline', 'rutaId', 'nuevoEstado', 'sincronizado', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt', 'sincronizado'],
} as const;

export interface EventoRutaDocType {
  uuidOffline: string;
  rutaId: number;
  nuevoEstado: string;
  sincronizado: boolean;
  createdAt: string;
  updatedAt: string;
}

export const eventoRutaSchema: RxJsonSchema<EventoRutaDocType> =
  eventoRutaSchemaLiteral as unknown as RxJsonSchema<EventoRutaDocType>;