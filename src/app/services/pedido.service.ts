import { Injectable, inject } from '@angular/core';
import { DetallePedido, EstadoPedido, PedidoCompleto } from '../models';
import { DbService, ESTADOS, EstadoInfo } from './db.service';
import { ApiPedidoService } from './api-pedido.service';

export interface ItemNuevoPedido {
  garrafaId: number;
  cantidad: number;
  precioUnitario: number;
}

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private db = inject(DbService);
  private apiPedido = inject(ApiPedidoService);

  getEstados(): EstadoInfo[] {
    return ESTADOS;
  }

  /**
   * Crea un pedido en IndexedDB con un UUID offline.
   * El pedido queda marcado como `sincronizado: false` hasta que se envíe al backend.
   */
  async crearPedido(
    usuarioId: number,
    direccionEntrega: string,
    items: ItemNuevoPedido[],
    observaciones: string,
  ): Promise<number> {
    const now = new Date().toISOString();
    const uuidOffline = crypto.randomUUID();
    const total = items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

    return this.db.transaction('rw', this.db.pedidos, this.db.detalles_pedidos, async () => {
      const idPedido = await this.db.pedidos.add({
        uuidOffline,
        created_at: now,
        usuarioId,
        direccionEntrega,
        estado: 'PENDIENTE',
        total,
        observaciones,
        sincronizado: false,
      });

      const detalles: DetallePedido[] = items.map((i) => ({
        created_at: now,
        pedidoUuid: uuidOffline,
        garrafaId: i.garrafaId,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.cantidad * i.precioUnitario,
      }));
      await this.db.detalles_pedidos.bulkAdd(detalles);
      return idPedido;
    });
  }

  /** Obtiene todos los pedidos con datos resueltos de usuario y garrafa */
  async getPedidos(): Promise<PedidoCompleto[]> {
    const [pedidos, usuarios, garrafas, detalles] = await Promise.all([
      this.db.pedidos.orderBy('created_at').reverse().toArray(),
      this.db.usuarios.toArray(),
      this.db.garrafas.toArray(),
      this.db.detalles_pedidos.toArray(),
    ]);

    const uMap = new Map(usuarios.map((u) => [u.id!, u]));
    const gMap = new Map(garrafas.map((g) => [g.id!, g]));

    return pedidos.map((p) => ({
      ...p,
      usuario: uMap.get(p.usuarioId),
      detalles: detalles
        .filter((d) => d.pedidoUuid === p.uuidOffline)
        .map((d) => ({ ...d, garrafa: gMap.get(d.garrafaId) })),
    }));
  }

  async cambiarEstado(idPedido: number, estado: EstadoPedido): Promise<void> {
    const pedido = await this.db.pedidos.get(idPedido);
    if (!pedido) return;

    if (pedido.backendId && navigator.onLine) {
      try {
        await this.apiPedido.cambiarEstado(pedido.backendId, estado);
      } catch (e) {
        console.error('[PedidoService] Error al actualizar estado en el servidor', e);
        throw e;
      }
    }

    await this.db.pedidos.update(idPedido, { estado });
  }

  /** Obtiene pedidos pendientes de sincronizar */
  async getPedidosPendientes(): Promise<PedidoCompleto[]> {
    const pedidos = await this.db.pedidos.filter((p) => p.sincronizado === false).toArray();
    const detalles = await this.db.detalles_pedidos.toArray();
    const garrafas = await this.db.garrafas.toArray();
    const usuarios = await this.db.usuarios.toArray();

    const uMap = new Map(usuarios.map((u) => [u.id!, u]));
    const gMap = new Map(garrafas.map((g) => [g.id!, g]));

    return pedidos.map((p) => ({
      ...p,
      usuario: uMap.get(p.usuarioId),
      detalles: detalles
        .filter((d) => d.pedidoUuid === p.uuidOffline)
        .map((d) => ({ ...d, garrafa: gMap.get(d.garrafaId) })),
    }));
  }

  /** Marca un pedido como sincronizado y guarda el backendId */
  async marcarSincronizado(uuidOffline: string, backendId: number): Promise<void> {
    const pedido = await this.db.pedidos.where('uuidOffline').equals(uuidOffline).first();
    if (pedido) {
      await this.db.pedidos.update(pedido.id!, {
        sincronizado: true,
        backendId,
      });
    }
  }
}
