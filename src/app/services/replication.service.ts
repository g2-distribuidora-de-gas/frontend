import { Injectable, inject } from '@angular/core';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';
import { RxDatabaseService } from './rx-database.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { ApiClienteService } from './api-cliente.service';
import { ToastService } from './toast.service';
import { PedidoDocType } from '../schemas/pedido.schema';
import { ClienteDocType } from '../schemas/cliente.schema';
import { GarrafaDocType } from '../schemas/garrafa.schema';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  PedidoRequest,
  SincronizacionRequest,
  SincronizacionResponse,
} from '../models/pedido.model';

interface ReplicationCheckpoint {
  updatedAt: string;
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ReplicationService {
  private rxDb = inject(RxDatabaseService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiCliente = inject(ApiClienteService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);

  private replicationStates: RxReplicationState<any, any>[] = [];
  private subscriptions: Subscription[] = [];
  private iniciada = false;


  async iniciar(): Promise<void> {
    if (this.iniciada) return;
    this.iniciada = true;
    this.iniciarReplicacionClientes();
    this.iniciarReplicacionGarrafas();
    this.iniciarReplicacionPedidos();
    console.log('[ReplicationService] Replicación iniciada para todas las colecciones.');
  }



  private iniciarReplicacionClientes(): void {
    const state = replicateRxCollection<ClienteDocType, ReplicationCheckpoint>({
      collection: this.rxDb.clientes,
      replicationIdentifier: 'clientes-pull-replication',
      autoStart: true,
      retryTime: 10_000,

      pull: {
        batchSize: 200,
        handler: async (lastCheckpoint, batchSize) => {
          try {
            const respuesta = await this.apiCliente.listarTodos();


            const documents = await Promise.all(
              respuesta.map(async (c) => {
                const id = String(c.id);
                const existente = await this.rxDb.clientes.findOne(id).exec();
                return {
                  id,
                  nombre: existente?.nombre ?? c.nombre,
                  apellido: existente?.apellido ?? '',
                  dni: existente?.dni ?? '',
                  telefono: c.telefono ?? existente?.telefono ?? '',
                  direccion: c.direccion ?? existente?.direccion ?? '',
                  activo: existente?.activo ?? true,
                  latitud: c.latitud ?? null,
                  longitud: c.longitud ?? null,
                  placeId: c.placeId ?? null,
                  updatedAt: new Date().toISOString(),
                  _deleted: false as const,
                };
              }),
            );

            const checkpoint: ReplicationCheckpoint = documents.length > 0
              ? { updatedAt: documents[documents.length - 1].updatedAt, id: documents[documents.length - 1].id }
              : lastCheckpoint ?? { updatedAt: '', id: '' };

            return { documents, checkpoint };
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, pausa temporal en pull de clientes.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer pull de clientes:', error);
            throw error;
          }
        },
      },

      push: undefined,
    });

    this.registrarEventos(state, 'clientes');
    this.replicationStates.push(state);
  }



  private iniciarReplicacionGarrafas(): void {
    const state = replicateRxCollection<GarrafaDocType, ReplicationCheckpoint>({
      collection: this.rxDb.garrafas,
      replicationIdentifier: 'garrafas-pull-replication',
      autoStart: true,
      retryTime: 10_000,

      pull: {
        batchSize: 100,
        handler: async (lastCheckpoint, batchSize) => {
          try {
            const respuesta = await this.apiGarrafa.listarTodas();
            const documents = respuesta.map((g) => ({
              id: String(g.id),
              tipo: g.tipo,
              capacidadKg: g.capacidadKg,
              precio: g.precio,
              stockDisponible: g.stockDisponible,
              activo: g.activo,
              updatedAt: new Date().toISOString(),
              _deleted: false as const,
            }));

            const checkpoint: ReplicationCheckpoint = documents.length > 0
              ? { updatedAt: documents[documents.length - 1].updatedAt, id: documents[documents.length - 1].id }
              : lastCheckpoint ?? { updatedAt: '', id: '' };

            return { documents, checkpoint };
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, pausa temporal en pull de garrafas.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer pull de garrafas:', error);
            throw error;
          }
        },
      },

      push: undefined,
    });

    this.registrarEventos(state, 'garrafas');
    this.replicationStates.push(state);
  }



  private iniciarReplicacionPedidos(): void {
    const state = replicateRxCollection<PedidoDocType, ReplicationCheckpoint>({
      collection: this.rxDb.pedidos,
      replicationIdentifier: 'pedidos-replication',
      autoStart: true,
      retryTime: 10_000,

      pull: {
        batchSize: 100,
        handler: async (lastCheckpoint, batchSize) => {
          try {
            const respuesta = await firstValueFrom(
              this.http.get<any[]>('/api/pedidos'),
            );

            const documents = respuesta.map((p: any) => ({
              uuidOffline: p.uuidOffline || crypto.randomUUID(),
              backendId: p.id,
              clienteId: String(p.clienteId),
              direccionEntrega: p.direccionEntrega ?? '',
              estado: p.estado,
              urlFotoEvidencia: p.urlFotoEvidencia ?? '',
              total: p.total,
              observaciones: p.observaciones ?? '',
              sincronizado: true,
              detalles: (p.detalles ?? []).map((d: any) => ({
                garrafaId: String(d.garrafaId),
                cantidad: d.cantidad,
                precioUnitario: d.precioUnitario,
                subtotal: d.subtotal,
              })),
              updatedAt: p.updatedAt ?? p.createdAt ?? new Date().toISOString(),
              _deleted: false as const,
            }));

            const checkpoint: ReplicationCheckpoint = documents.length > 0
              ? { updatedAt: documents[documents.length - 1].updatedAt, id: documents[documents.length - 1].uuidOffline }
              : lastCheckpoint ?? { updatedAt: '', id: '' };

            return { documents, checkpoint };
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, pausa temporal en pull de pedidos.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer pull de pedidos:', error);
            throw error;
          }
        },
      },

      push: {
        batchSize: 20,
        handler: async (rows) => {

          const nuevos = rows
            .filter((row) => !row.newDocumentState.sincronizado)
            .map((row) => row.newDocumentState);

          if (nuevos.length === 0) return [];

          const pedidosRequest: PedidoRequest[] = nuevos.map((p) => ({
            uuidOffline: p.uuidOffline,
            clienteId: Number(p.clienteId),
            direccionEntrega: p.direccionEntrega ?? '',
            urlFotoEvidencia: p.urlFotoEvidencia || undefined,
            detalles: p.detalles.map((d) => ({
              garrafaId: Number(d.garrafaId),
              cantidad: d.cantidad,
            })),
          }));

          try {
            const request: SincronizacionRequest = { pedidos: pedidosRequest };
            const response = await firstValueFrom(
              this.http.post<SincronizacionResponse>('/api/sincronizar', request),
            );


            for (const procesado of response.procesados) {
              const doc = await this.rxDb.pedidos.findOne(procesado.uuidOffline).exec();
              if (doc) {
                await doc.patch({
                  sincronizado: true,
                  backendId: procesado.pedidoId,
                  updatedAt: new Date().toISOString(),
                });
              }
            }


            for (const uuid of response.duplicados) {
              const doc = await this.rxDb.pedidos.findOne(uuid).exec();
              if (doc && !doc.sincronizado) {
                await doc.patch({ sincronizado: true, updatedAt: new Date().toISOString() });
              }
            }


            const ok = response.procesados.length;
            const dup = response.duplicados.length;
            const err = response.errores.length;
            if (ok > 0) this.toast.exito(`${ok} pedido(s) sincronizado(s).`);
            if (dup > 0) this.toast.mostrar(`${dup} pedido(s) ya estaban en el servidor.`, 'info');
            if (err > 0) this.toast.error(`${err} pedido(s) fallaron al sincronizar.`);


            return [];
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, los pedidos se sincronizarán cuando vuelva la conexión.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer push de pedidos:', error);
            this.toast.error('No se pudo sincronizar pedidos con el servidor.');
            throw error;
          }
        },
      },
    });

    this.registrarEventos(state, 'pedidos');
    this.replicationStates.push(state);
  }



  private registrarEventos(state: RxReplicationState<any, any>, nombre: string): void {
    this.subscriptions.push(
      state.error$.subscribe((err: any) => {
        const isNetworkError = err.parameters?.errors?.status === 0 || err.parameters?.errors?.name === 'HttpErrorResponse' || !navigator.onLine;
        if (isNetworkError) {
          console.warn(`[ReplicationService] Pausa temporal en replicación de ${nombre} por falta de red.`);
        } else {
          console.error(`[ReplicationService] Error en replicación de ${nombre}:`, err);
        }
      }),
    );
    this.subscriptions.push(
      state.active$.subscribe((active) => {
        if (active) {
          console.log(`[ReplicationService] Replicación de ${nombre} activa.`);
        }
      }),
    );
  }


  async resincronizar(): Promise<void> {
    for (const state of this.replicationStates) {
      await state.reSync();
    }
  }


  async cancelar(): Promise<void> {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];

    for (const state of this.replicationStates) {
      await state.cancel();
    }
    this.replicationStates = [];

    this.iniciada = false;
  }
}
