import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { DetallePedido, Pedido, type EstadoPedido } from '../models/pedido.model';
import { Garrafa } from '../models/garrafa.model';
import { Usuario } from '../models/usuario.model';

/** Información de estado para la UI */
export interface EstadoInfo {
  id: EstadoPedido;
  nombre: string;
}

export const ESTADOS: EstadoInfo[] = [
  { id: 'PENDIENTE', nombre: 'Pendiente' },
  { id: 'EN_PROCESO', nombre: 'En proceso' },
  { id: 'ENTREGADO', nombre: 'Entregado' },
  { id: 'CANCELADO', nombre: 'Cancelado' },
];

@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  usuarios!: Table<Usuario, number>;
  garrafas!: Table<Garrafa, number>;
  pedidos!: Table<Pedido, number>;
  detalles_pedidos!: Table<DetallePedido, number>;

  constructor() {
    super('distribuidora-gas');

    // Version 2: modelos alineados con el backend
    this.version(2).stores({
      usuarios: '++id, nombre, apellido, dni, activo',
      garrafas: '++id, tipo, activo',
      pedidos: '++id, uuidOffline, usuarioId, estado, created_at, sincronizado',
      detalles_pedidos: '++id, pedidoUuid, garrafaId',
      // Eliminar tablas viejas de v1
      clientes: null,
      productos: null,
      estados_pedido: null,
    }).upgrade(async (tx) => {
      // Limpiar datos viejos si existían — la v2 se re-seedea
      console.log('[DbService] Migrando de v1 a v2...');
    });

    this.on('populate', () => this.seed());
  }

  private async seed(): Promise<void> {
    const now = new Date().toISOString();
    await this.garrafas.bulkAdd([
      { created_at: now, tipo: 'GARRAFA_10KG', capacidadKg: 10, precio: 12500, stockDisponible: 50, activo: true },
      { created_at: now, tipo: 'GARRAFA_15KG', capacidadKg: 15, precio: 17800, stockDisponible: 40, activo: true },
      { created_at: now, tipo: 'GARRAFA_45KG', capacidadKg: 45, precio: 47900, stockDisponible: 20, activo: true },
    ]);
    await this.usuarios.bulkAdd([
      { created_at: now, nombre: 'María', apellido: 'González', dni: '30123456', telefono: '3874112233', direccion: 'Av. Belgrano 1250', activo: true },
      { created_at: now, nombre: 'Juan', apellido: 'Pérez', dni: '28987654', telefono: '3874556677', direccion: 'Calle San Martín 480', activo: true },
      { created_at: now, nombre: 'Rosario', apellido: 'Fernández', dni: '35456789', telefono: '3875889900', direccion: 'B° El Carmen, Mza 4 Casa 12', activo: true },
      { created_at: now, nombre: 'Carlos', apellido: 'Aguirre', dni: '32112233', telefono: '3876223344', direccion: 'Ruta 9 km 1580', activo: true },
    ]);
  }
}
