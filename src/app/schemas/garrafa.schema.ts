import {
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
  RxJsonSchema,
} from 'rxdb';

export const garrafaSchemaLiteral = {
  title: 'garrafa schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    tipo: { type: 'string', maxLength: 20 },
    capacidadKg: { type: 'number' },
    precio: { type: 'number' },
    stockDisponible: { type: 'number' },
    activo: { type: 'boolean' },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'tipo', 'capacidadKg', 'precio', 'activo', 'updatedAt'] as const,
  indexes: ['updatedAt', 'tipo'],
} as const;

const schemaTyped = toTypedRxJsonSchema(garrafaSchemaLiteral);
export type GarrafaDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const garrafaSchema: RxJsonSchema<GarrafaDocType> = garrafaSchemaLiteral;
