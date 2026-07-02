import { Injectable, inject } from '@angular/core';
import { DetallePedido, EstadoPedido, PedidoCompleto } from '../models';
import { DbService, ESTADOS } from './db.service';

export interface ItemNuevoPedido {
  id_producto: number;
  cantidad: number;
  precio_unitario: number;
}

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private db = inject(DbService);

  getEstados(): Promise<EstadoPedido[]> {
    return this.db.estados_pedido.toArray();
  }

  /** Crea el pedido y sus detalles en una transacción */
  async crearPedido(idCliente: number, items: ItemNuevoPedido[], observaciones: string): Promise<number> {
    const now = new Date().toISOString();
    const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
    return this.db.transaction('rw', this.db.pedidos, this.db.detalles_pedidos, async () => {
      const idPedido = await this.db.pedidos.add({
        created_at: now,
        id_cliente: idCliente,
        estado_id: ESTADOS[0].id, // Pendiente
        total,
        observaciones,
      });
      const detalles: DetallePedido[] = items.map((i) => ({
        created_at: now,
        id_pedido: idPedido,
        id_producto: i.id_producto,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.cantidad * i.precio_unitario,
      }));
      await this.db.detalles_pedidos.bulkAdd(detalles);
      return idPedido;
    });
  }


  async getPedidos(): Promise<PedidoCompleto[]> {
    const [pedidos, clientes, productos, estados, detalles] = await Promise.all([
      this.db.pedidos.orderBy('created_at').reverse().toArray(),
      this.db.clientes.toArray(),
      this.db.productos.toArray(),
      this.db.estados_pedido.toArray(),
      this.db.detalles_pedidos.toArray(),
    ]);
    const cMap = new Map(clientes.map((c) => [c.id!, c]));
    const pMap = new Map(productos.map((p) => [p.id!, p]));
    const eMap = new Map(estados.map((e) => [e.id, e]));
    return pedidos.map((p) => ({
      ...p,
      cliente: cMap.get(p.id_cliente),
      estado: eMap.get(p.estado_id),
      detalles: detalles
        .filter((d) => d.id_pedido === p.id)
        .map((d) => ({ ...d, producto: pMap.get(d.id_producto) })),
    }));
  }

  async cambiarEstado(idPedido: number, estadoId: string): Promise<void> {
    await this.db.pedidos.update(idPedido, { estado_id: estadoId });
  }
}
