import { Injectable, inject } from '@angular/core';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';
import { RxDatabaseService } from './rx-database.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { ApiUsuarioService } from './api-usuario.service';
import { ToastService } from './toast.service';
import { PedidoDocType } from '../schemas/pedido.schema';
import { UsuarioDocType } from '../schemas/usuario.schema';
import { GarrafaDocType } from '../schemas/garrafa.schema';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  PedidoRequest,
  SincronizacionRequest,
  SincronizacionResponse,
} from '../models/pedido.model';

/** Checkpoint para rastrear la última sincronización */
interface ReplicationCheckpoint {
  updatedAt: string;
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ReplicationService {
  private rxDb = inject(RxDatabaseService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiUsuario = inject(ApiUsuarioService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);

  private replicationStates: RxReplicationState<any, any>[] = [];

  /**
   * Inicia la replicación para todas las colecciones.
   * Debe llamarse después de que la DB esté inicializada.
   */
  async iniciar(): Promise<void> {
    this.iniciarReplicacionUsuarios();
    this.iniciarReplicacionGarrafas();
    this.iniciarReplicacionPedidos();
    console.log('[ReplicationService] Replicación iniciada para todas las colecciones.');
  }

  // ─── Usuarios: Pull-only (datos maestros) ───

  private iniciarReplicacionUsuarios(): void {
    const state = replicateRxCollection<UsuarioDocType, ReplicationCheckpoint>({
      collection: this.rxDb.usuarios,
      replicationIdentifier: 'usuarios-pull-replication',
      autoStart: true,
      retryTime: 10_000,

      pull: {
        batchSize: 200,
        handler: async (lastCheckpoint, batchSize) => {
          try {
            const respuesta = await this.apiUsuario.listarTodos();
            const documents = respuesta.map((u) => ({
              id: String(u.id),
              nombre: u.nombre,
              apellido: u.apellido,
              dni: u.dni,
              telefono: u.telefono ?? '',
              direccion: u.direccion ?? '',
              activo: u.activo,
              updatedAt: new Date().toISOString(),
              _deleted: false as const,
            }));

            const checkpoint: ReplicationCheckpoint = documents.length > 0
              ? { updatedAt: documents[documents.length - 1].updatedAt, id: documents[documents.length - 1].id }
              : lastCheckpoint ?? { updatedAt: '', id: '' };

            return { documents, checkpoint };
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, pausa temporal en pull de usuarios.');
              throw error;
            }
            console.error('[ReplicationService] Error al hacer pull de usuarios:', error);
            throw error;
          }
        },
      },

      push: undefined,
    });

    this.registrarEventos(state, 'usuarios');
    this.replicationStates.push(state);
  }

  // ─── Garrafas: Pull-only (datos maestros) ───

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

  // ─── Pedidos: Push + Pull ───

  private iniciarReplicacionPedidos(): void {
    const state = replicateRxCollection<PedidoDocType, ReplicationCheckpoint>({
      collection: this.rxDb.pedidos,
      replicationIdentifier: 'pedidos-replication',
      autoStart: true,
      retryTime: 5_000,

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
              usuarioId: String(p.usuarioId),
              direccionEntrega: p.direccionEntrega ?? '',
              estado: p.estado,
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
          // Solo pushear pedidos no sincronizados
          const nuevos = rows
            .filter((row) => !row.newDocumentState.sincronizado)
            .map((row) => row.newDocumentState);

          if (nuevos.length === 0) return [];

          const pedidosRequest: PedidoRequest[] = nuevos.map((p) => ({
            uuidOffline: p.uuidOffline,
            usuarioId: Number(p.usuarioId),
            direccionEntrega: p.direccionEntrega ?? '',
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

            // Marcar localmente como sincronizados
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

            // Duplicados ya estaban sincronizados
            for (const uuid of response.duplicados) {
              const doc = await this.rxDb.pedidos.findOne(uuid).exec();
              if (doc && !doc.sincronizado) {
                await doc.patch({ sincronizado: true, updatedAt: new Date().toISOString() });
              }
            }

            // Notificar
            const ok = response.procesados.length;
            const dup = response.duplicados.length;
            const err = response.errores.length;
            if (ok > 0) this.toast.exito(`${ok} pedido(s) sincronizado(s).`);
            if (dup > 0) this.toast.mostrar(`${dup} pedido(s) ya estaban en el servidor.`, 'info');
            if (err > 0) this.toast.error(`${err} pedido(s) fallaron al sincronizar.`);

            // No hay conflictos en este modelo — el server acepta o rechaza
            return [];
          } catch (error: any) {
            if (error.status === 0 || !navigator.onLine) {
              console.warn('[ReplicationService] Dispositivo offline, los pedidos se sincronizarán cuando vuelva la conexión.');
              throw error; // Throw para que RxDB lo reintente, pero sin mostrar toast
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

  // ─── Helpers ───

  private registrarEventos(state: RxReplicationState<any, any>, nombre: string): void {
    state.error$.subscribe((err: any) => {
      // Ignorar errores RC_PUSH y RC_PULL si son por falta de red (offline)
      const isNetworkError = err.parameters?.errors?.status === 0 || err.parameters?.errors?.name === 'HttpErrorResponse' || !navigator.onLine;
      if (isNetworkError) {
         console.warn(`[ReplicationService] Pausa temporal en replicación de ${nombre} por falta de red.`);
      } else {
         console.error(`[ReplicationService] Error en replicación de ${nombre}:`, err);
      }
    });
    state.active$.subscribe((active) => {
      if (active) {
        console.log(`[ReplicationService] Replicación de ${nombre} activa.`);
      }
    });
  }

  /** Fuerza una resincronización de todas las colecciones */
  async resincronizar(): Promise<void> {
    for (const state of this.replicationStates) {
      await state.reSync();
    }
  }

  /** Cancela todas las replicaciones (cleanup) */
  async cancelar(): Promise<void> {
    for (const state of this.replicationStates) {
      await state.cancel();
    }
    this.replicationStates = [];
  }
}