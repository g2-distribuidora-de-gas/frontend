import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Cliente, DetallePedido, EstadoPedido, Pedido, Producto } from '../models';

export const ESTADOS: EstadoPedido[] = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Pendiente' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'En camino' },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Entregado' },
  { id: '44444444-4444-4444-8444-444444444444', nombre: 'Cancelado' },
];

@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  clientes!: Table<Cliente, number>;
  productos!: Table<Producto, number>;
  pedidos!: Table<Pedido, number>;
  detalles_pedidos!: Table<DetallePedido, number>;
  estados_pedido!: Table<EstadoPedido, string>;

  constructor() {
    super('distribuidora-gas');
    this.version(1).stores({
      clientes: '++id, nombre, apellido, activo',
      productos: '++id, nombre, tipo, activo',
      pedidos: '++id, id_cliente, estado_id, created_at',
      detalles_pedidos: '++id, id_pedido, id_producto',
      estados_pedido: 'id, nombre',
    });
    this.on('populate', () => this.seed());
  }

 
  private async seed(): Promise<void> {
    const now = new Date().toISOString();
    await this.estados_pedido.bulkAdd(ESTADOS);
    await this.productos.bulkAdd([
      { created_at: now, nombre: 'Garrafa 10 kg', capacidad_kg: 10, precio_actual: 12500, activo: true, tipo: 'garrafa' },
      { created_at: now, nombre: 'Garrafa 15 kg', capacidad_kg: 15, precio_actual: 17800, activo: true, tipo: 'garrafa' },
      { created_at: now, nombre: 'Garrafa 30 kg', capacidad_kg: 30, precio_actual: 33500, activo: true, tipo: 'garrafa' },
      { created_at: now, nombre: 'Cilindro 45 kg', capacidad_kg: 45, precio_actual: 47900, activo: true, tipo: 'cilindro' },
    ]);
    await this.clientes.bulkAdd([
      { created_at: now, nombre: 'María', apellido: 'González', telefono: 3874112233, email: 'maria.gonzalez@mail.com', activo: true, direccion: 'Av. Belgrano 1250' },
      { created_at: now, nombre: 'Juan', apellido: 'Pérez', telefono: 3874556677, email: 'juan.perez@mail.com', activo: true, direccion: 'Calle San Martín 480' },
      { created_at: now, nombre: 'Rosario', apellido: 'Fernández', telefono: 3875889900, email: 'rosario.f@mail.com', activo: true, direccion: 'B° El Carmen, Mza 4 Casa 12' },
      { created_at: now, nombre: 'Carlos', apellido: 'Aguirre', telefono: 3876223344, email: 'c.aguirre@mail.com', activo: true, direccion: 'Ruta 9 km 1580' },
    ]);
  }
}
