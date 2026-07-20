import { Injectable, inject } from '@angular/core';
import { DetallePedido, EstadoPedido, PedidoCompleto } from '../models/pedido.model';
import { RxDatabaseService, ESTADOS, EstadoInfo } from './rx-database.service';
import { ApiPedidoService } from './api-pedido.service';
import { DbRecoveryService } from './db-recovery.service';
import { AuthService } from './auth.service';
import { Observable, combineLatest, EMPTY } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface ItemNuevoPedido {
  tipoGarrafaId: string;
  cantidad: number;
  precioUnitario: number;
}

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private rxDb = inject(RxDatabaseService);
  private apiPedido = inject(ApiPedidoService);
  private recovery = inject(DbRecoveryService);
  private auth = inject(AuthService);

  getEstados(): EstadoInfo[] {
    return ESTADOS;
  }

  /**
   * Crea un pedido en RxDB con un UUID offline.
   * El pedido queda marcado como `sincronizado: false` hasta que se replique al backend.
   */
  async crearPedido(
    clienteId: string,
    direccionEntrega: string,
    items: ItemNuevoPedido[],
    observaciones: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const uuidOffline = crypto.randomUUID();
    const total = items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);

    const detalles: DetallePedido[] = items.map((i) => ({
      tipoGarrafaId: i.tipoGarrafaId,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      subtotal: i.cantidad * i.precioUnitario,
    }));

    await this.rxDb.pedidos.insert({
      uuidOffline,
      creadorId: this.auth.userId() ?? undefined,
      clienteId,
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

  getPedidos$(): Observable<PedidoCompleto[]> {
    return this.protegerDbCerrada(
      combineLatest([
        this.rxDb.pedidos.find({ sort: [{ updatedAt: 'desc' }] }).$,
        this.rxDb.clientes.find().$,
        this.rxDb.garrafas.find().$,
      ]).pipe(
        map(([pedidoDocs, clienteDocs, garrafaDocs]) => {
          const cMap = new Map(clienteDocs.map((c) => [c.id, c.toJSON()]));
          const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));
          return pedidoDocs.map((doc) => this.enriquecer(doc.toJSON(), cMap, gMap));
        }),
      ),
    );
  }

  getPedidosPendientes$(): Observable<PedidoCompleto[]> {
    return this.protegerDbCerrada(
      combineLatest([
        this.rxDb.pedidos.find({ selector: { sincronizado: false } }).$,
        this.rxDb.clientes.find().$,
        this.rxDb.garrafas.find().$,
      ]).pipe(
        map(([pedidoDocs, clienteDocs, garrafaDocs]) => {
          const cMap = new Map(clienteDocs.map((c) => [c.id, c.toJSON()]));
          const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));
          return pedidoDocs.map((doc) => this.enriquecer(doc.toJSON(), cMap, gMap));
        }),
      ),
    );
  }

  private protegerDbCerrada<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      catchError((err: any) => {
        if (err?.name === 'DatabaseClosedError') {
          void this.recovery.manejarDbCerrada();
          return EMPTY;
        }
        throw err;
      }),
    );
  }

  async getPedidos(): Promise<PedidoCompleto[]> {
    const [pedidoDocs, clienteDocs, garrafaDocs] = await Promise.all([
      this.rxDb.pedidos.find({ sort: [{ updatedAt: 'desc' }] }).exec(),
      this.rxDb.clientes.find().exec(),
      this.rxDb.garrafas.find().exec(),
    ]);

    const cMap = new Map(clienteDocs.map((c) => [c.id, c.toJSON()]));
    const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));

    return pedidoDocs.map((doc) => this.enriquecer(doc.toJSON(), cMap, gMap));
  }

  async getPedidosPendientes(): Promise<PedidoCompleto[]> {
    const pedidoDocs = await this.rxDb.pedidos
      .find({ selector: { sincronizado: false } })
      .exec();

    const [clienteDocs, garrafaDocs] = await Promise.all([
      this.rxDb.clientes.find().exec(),
      this.rxDb.garrafas.find().exec(),
    ]);

    const cMap = new Map(clienteDocs.map((c) => [c.id, c.toJSON()]));
    const gMap = new Map(garrafaDocs.map((g) => [g.id, g.toJSON()]));

    return pedidoDocs.map((doc) => this.enriquecer(doc.toJSON(), cMap, gMap));
  }

  private enriquecer(
    pedido: any,
    cMap: Map<string, any>,
    gMap: Map<string, any>,
  ): PedidoCompleto {
    const p = JSON.parse(JSON.stringify(pedido)) as any;
    return {
      ...p,
      estado: p.estado as EstadoPedido,
      cliente: cMap.get(p.clienteId),
      detallesResueltos: (p.detalles ?? []).map((d: DetallePedido) => ({
        ...d,
        garrafa: gMap.get(d.tipoGarrafaId),
      })),
    } as PedidoCompleto;
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
}
