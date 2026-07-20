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
    codigo: { type: 'string', maxLength: 20 },
    descripcion: { type: 'string', maxLength: 120 },
    capacidadKg: { type: 'number' },
    precio: { type: 'number' },
    activo: { type: 'boolean' },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'codigo', 'capacidadKg', 'activo', 'updatedAt'] as const,
  indexes: ['updatedAt', 'codigo'],
} as const;

const schemaTyped = toTypedRxJsonSchema(garrafaSchemaLiteral);
export type GarrafaDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const garrafaSchema: RxJsonSchema<GarrafaDocType> = garrafaSchemaLiteral;
