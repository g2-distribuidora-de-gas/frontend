import { Injectable, inject } from '@angular/core';
import { DetallePedido, EstadoPedido, PedidoCompleto } from '../models';
import { RxDatabaseService, ESTADOS, EstadoInfo } from './rx-database.service';
import { ApiPedidoService } from './api-pedido.service';

export interface ItemNuevoPedido {
  garrafaId: string;
  cantidad: number;
  precioUnitario: number;
}

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private rxDb = inject(RxDatabaseService);
  private apiPedido = inject(ApiPedidoService);

  getEstados(): EstadoInfo[] {
    return ESTADOS;
  }

  /**
   * Crea un pedido en RxDB con un UUID offline.
   * El pedido queda marcado como `sincronizado: false` hasta que se replique al backend.
   */
  async crearPedido(
    usuarioId: string,
    direccionEntrega: string,
    items: ItemNuevoPedido[],
    observaciones: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const uuidOffline = crypto.randomUUID();
    const total = items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

    const detalles: DetallePedido[] = items.map((i) => ({
      garrafaId: i.garrafaId,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      subtotal: i.cantidad * i.precioUnitario,
    }));

    await this.rxDb.pedidos.insert({
      uuidOffline,
      usuarioId,
      direccionEntrega,
      estado: 'PENDIENTE',
      total,
      observaciones,
      sincronizado: false,
      detalles,
      updatedAt: now,
    });

    return uuidOffline;
  }

  /** Obtiene todos los pedidos con datos resueltos de usuario y garrafa */
  async getPedidos(): Promise<PedidoCompleto[]> {
    const [pedidoDocs, usuarioDocs, garrafaDocs] = await Promise.all([
      this.rxDb.pedidos.find({ sort: [{ updatedAt: 'desc' }] }).exec(),
      this.rxDb.usuarios.find().exec(),
      this.rxDb.garrafas.find().exec(),
    ]);

    const uMap = new Map(usuarioDocs.map((u) => [u.id, u.toJSON()]));
    const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));

    return pedidoDocs.map((doc) => {
      const p = JSON.parse(JSON.stringify(doc.toJSON())) as any;
      return {
        ...p,
        estado: p.estado as EstadoPedido,
        usuario: uMap.get(p.usuarioId),
        detallesResueltos: (p.detalles ?? []).map((d: DetallePedido) => ({
          ...d,
          garrafa: gMap.get(d.garrafaId),
        })),
      } as PedidoCompleto;
    });
  }

  async cambiarEstado(uuidOffline: string, estado: EstadoPedido): Promise<void> {
    const doc = await this.rxDb.pedidos.findOne(uuidOffline).exec();
    if (!doc) return;

    // Si tiene backendId y hay conexión, actualizar también en el servidor
    if (doc.backendId && navigator.onLine) {
      try {
        await this.apiPedido.cambiarEstado(doc.backendId, estado);
      } catch (e) {
        console.error('[PedidoService] Error al actualizar estado en el servidor', e);
        throw e;
      }
    }

    await doc.patch({ estado, updatedAt: new Date().toISOString() });
  }

  /** Obtiene pedidos pendientes de sincronizar */
  async getPedidosPendientes(): Promise<PedidoCompleto[]> {
    const pedidoDocs = await this.rxDb.pedidos
      .find({ selector: { sincronizado: false } })
      .exec();

    const [usuarioDocs, garrafaDocs] = await Promise.all([
      this.rxDb.usuarios.find().exec(),
      this.rxDb.garrafas.find().exec(),
    ]);

    const uMap = new Map(usuarioDocs.map((u) => [u.id, u.toJSON()]));
    const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));

    return pedidoDocs.map((doc) => {
      const p = JSON.parse(JSON.stringify(doc.toJSON())) as any;
      return {
        ...p,
        estado: p.estado as EstadoPedido,
        usuario: uMap.get(p.usuarioId),
        detallesResueltos: (p.detalles ?? []).map((d: DetallePedido) => ({
          ...d,
          garrafa: gMap.get(d.garrafaId),
        })),
      } as PedidoCompleto;
    });
  }
}
