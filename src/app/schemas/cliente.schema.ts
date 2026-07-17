import {
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
  RxJsonSchema,
} from 'rxdb';


export const clienteSchemaLiteral = {
  title: 'cliente schema',
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    backendId: { type: ['number', 'null'] },
    sincronizado: { type: 'boolean' },
    nombre: { type: 'string' },
    apellido: { type: 'string' },
    telefono: { type: 'string' },
    direccion: { type: 'string' },
    activo: { type: 'boolean' },
    latitud: { type: ['number', 'null'] },
    longitud: { type: ['number', 'null'] },
    placeId: { type: ['string', 'null'] },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'nombre', 'activo', 'sincronizado', 'updatedAt'] as const,
  indexes: ['updatedAt', 'sincronizado'],
} as const;

const schemaTyped = toTypedRxJsonSchema(clienteSchemaLiteral);
export type ClienteDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const clienteSchema: RxJsonSchema<ClienteDocType> = clienteSchemaLiteral;