import {toTypedRxJsonSchema,ExtractDocumentTypeFromTypedRxJsonSchema,RxJsonSchema} from 'rxdb';

export const depositoSchemaLiteral = {
  title: 'deposito schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    nombre: { type: 'string', maxLength: 120 },
    tipo: { type: 'string', maxLength: 30 },
    descripcion: { type: 'string' },
    activo: { type: 'boolean' },
    vehiculoPatente: { type: 'string', maxLength: 30 },
    repartidorId: { type: ['number', 'null'] },
    repartidorNombre: { type: 'string' },
    repartidorEmail: { type: 'string' },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'nombre', 'tipo', 'activo', 'updatedAt'] as const,
  indexes: ['updatedAt', 'tipo'],
} as const;

const schemaTyped = toTypedRxJsonSchema(depositoSchemaLiteral);
export type DepositoDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const depositoSchema: RxJsonSchema<DepositoDocType> = depositoSchemaLiteral;
