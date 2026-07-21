import { RxJsonSchema } from 'rxdb';
import { AgendaRepartidorResponse } from '../models/ruta.model';

export type AgendaDocType = Omit<AgendaRepartidorResponse, 'rutaId'> & { rutaId: string };

export const agendaSchemaLiteral = {
  title: 'agenda schema',
  version: 0,
  primaryKey: 'rutaId',
  type: 'object',
  properties: {
    rutaId: { type: 'string', maxLength: 36 },
    repartidorId: { type: 'number' },
    fechaReparto: { type: 'string' },
    estado: { type: 'string' },
    cantidadParadas: { type: 'number' },
    paradasEntregadas: { type: 'number' },
    paradasFallidas: { type: 'number' },
    paradasPendientes: { type: 'number' },
    distanciaTotalM: { type: ['number', 'null'] },
    duracionTotalS: { type: ['number', 'null'] },
    confirmacionRepartidor: { type: 'string' },
    notasAdmin: { type: ['string', 'null'] },
  },
  required: ['rutaId', 'repartidorId', 'fechaReparto', 'estado', 'confirmacionRepartidor'],
} as const;

export const agendaSchema: RxJsonSchema<AgendaDocType> = agendaSchemaLiteral as unknown as RxJsonSchema<AgendaDocType>;
