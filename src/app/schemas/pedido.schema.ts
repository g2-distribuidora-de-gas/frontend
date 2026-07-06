import {
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
  RxJsonSchema,
} from 'rxdb';

/**
 * Schema de pedido con detalles embebidos.
 * Los detalles se almacenan como array dentro del documento pedido,
 * eliminando la necesidad de una colección separada y simplificando
 * la replicación (se sincronizan como unidad atómica).
 */
export const pedidoSchemaLiteral = {
  title: 'pedido schema',
  version: 0,
  primaryKey: 'uuidOffline',
  type: 'object',
  properties: {
    uuidOffline: { type: 'string', maxLength: 36 },
    backendId: { type: 'number' },
    usuarioId: { type: 'string', maxLength: 36 },
    direccionEntrega: { type: 'string' },
    estado: { type: 'string', maxLength: 20 },
    total: { type: 'number' },
    observaciones: { type: 'string' },
    sincronizado: { type: 'boolean' },
    detalles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          garrafaId: { type: 'string', maxLength: 36 },
          cantidad: { type: 'number' },
          precioUnitario: { type: 'number' },
          subtotal: { type: 'number' },
        },
        required: ['garrafaId', 'cantidad', 'precioUnitario', 'subtotal'],
      },
    },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: [
    'uuidOffline',
    'usuarioId',
    'estado',
    'total',
    'sincronizado',
    'updatedAt',
    'detalles',
    'direccionEntrega',
    'observaciones',
  ] as const,
  indexes: ['updatedAt', 'estado', 'sincronizado'],
} as const;

const schemaTyped = toTypedRxJsonSchema(pedidoSchemaLiteral);
export type PedidoDocType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof schemaTyped>;
export const pedidoSchema: RxJsonSchema<PedidoDocType> = pedidoSchemaLiteral;
