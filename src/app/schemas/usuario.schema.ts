import {
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
  RxJsonSchema,
} from 'rxdb';

export const usuarioSchemaLiteral = {
  title: 'usuario schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    nombre: { type: 'string' },
    apellido: { type: 'string' },
    dni: { type: 'string', maxLength: 20 },
    telefono: { type: 'string' },
    direccion: { type: 'string' },
    activo: { type: 'boolean' },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id', 'nombre', 'apellido', 'dni', 'activo', 'updatedAt'] as const,
  indexes: ['updatedAt', 'dni'],
} as const;

const schemaTyped = toTypedRxJsonSchema(usuarioSchemaLiteral);
export type UsuarioDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const usuarioSchema: RxJsonSchema<UsuarioDocType> = usuarioSchemaLiteral;
