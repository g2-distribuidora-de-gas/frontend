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

          
            const existentesDocs = await this.rxDb.clientes.find().exec();
            const existentes = new Map(existentesDocs.map((d) => [d.id, d]));

            const documents = respuesta.map((c) => {
              const id = String(c.id);
              const ex = existentes.get(id);
              return {
                id,
                nombre: ex?.nombre ?? c.nombre,
                apellido: ex?.apellido ?? '',
                dni: ex?.dni ?? '',
                telefono: c.telefono ?? ex?.telefono ?? '',
                direccion: c.direccion ?? ex?.direccion ?? '',
                activo: ex?.activo ?? c.activo ?? true,
                latitud: c.latitud ?? ex?.latitud ?? null,
                longitud: c.longitud ?? ex?.longitud ?? null,
                placeId: c.placeId ?? ex?.placeId ?? null,
                updatedAt: new Date().toISOString(),
                _deleted: false as const,
              };
            });

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

            const existentesDocs = await this.rxDb.pedidos.find().exec();
            const porBackendId = new Map<number, PedidoDocType>();
            for (const d of existentesDocs) {
              if (d.backendId != null) porBackendId.set(d.backendId, d.toJSON() as PedidoDocType);
            }

            const documents = respuesta.map((p: any) => {
              let uuidOffline: string = p.uuidOffline;
              if (!uuidOffline) {
                uuidOffline = porBackendId.get(p.id)?.uuidOffline ?? crypto.randomUUID();
              }

              return {
                uuidOffline,
                backendId: p.id,
                creadorId: p.creadorId ?? undefined,
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
              };
            });

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
            creadorId: p.creadorId ?? undefined,
            direccionEntrega: p.direccionEntrega ?? '',
            urlFotoEvidencia: p.urlFotoEvidencia || undefined,
            detalles: p.detalles.map((d) => ({
              garrafaId: Number(d.garrafaId),
              cantidad: d.cantidad,
            })),
          }));

          const request: SincronizacionRequest = { pedidos: pedidosRequest };
          let response: SincronizacionResponse;
          try {
            response = await firstValueFrom(
              this.http.post<SincronizacionResponse>('/api/sincronizar', request),
            );
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Offline, los pedidos se sincronizarán al volver la conexión.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer push de pedidos:', error);
            this.toast.error('No se pudo sincronizar pedidos con el servidor.');
            throw error;
          }

          const yaEnServidor: { uuid: string; backendId?: number }[] = [
            ...response.procesados.map((p) => ({ uuid: p.uuidOffline, backendId: p.pedidoId })),
            ...response.duplicados.map((uuid) => ({ uuid, backendId: undefined })),
          ];

          for (const { uuid, backendId } of yaEnServidor) {
            try {
              const doc = await this.rxDb.pedidos.findOne(uuid).exec();
              if (doc && !doc.sincronizado) {
                await doc.patch({
                  sincronizado: true,
                  ...(backendId ? { backendId } : {}),
                  updatedAt: new Date().toISOString(),
                });
              }
            } catch (e) {
              console.error('[push] no se pudo marcar sincronizado', uuid, e);
            }
          }

          const ok = response.procesados.length;
          const dup = response.duplicados.length;
          const err = response.errores.length;
          if (ok > 0) this.toast.exito(`${ok} pedido(s) sincronizado(s).`);
          if (dup > 0) this.toast.mostrar(`${dup} pedido(s) ya estaban en el servidor.`, 'info');
          if (err > 0) this.toast.error(`${err} pedido(s) fallaron al sincronizar.`);

          return [];
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
