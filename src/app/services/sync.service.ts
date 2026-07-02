import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PedidoRequest,
  SincronizacionEstadoResponse,
  SincronizacionRequest,
  SincronizacionResponse,
} from '../models/pedido.model';
import { PedidoService } from './pedido.service';
import { ToastService } from './toast.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { ApiUsuarioService } from './api-usuario.service';
import { CatalogoService } from './catalogo.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private http = inject(HttpClient);
  private pedidoSrv = inject(PedidoService);
  private toast = inject(ToastService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiUsuario = inject(ApiUsuarioService);
  private catalogo = inject(CatalogoService);

  private syncing = false;

  /** POST /api/sincronizar — enviar batch de pedidos offline */
  async sincronizar(): Promise<SincronizacionResponse | null> {
    if (this.syncing || !navigator.onLine) return null;
    this.syncing = true;

    try {
      const pendientes = await this.pedidoSrv.getPedidosPendientes();
      if (pendientes.length === 0) return null;

      // Armar los DTOs para el backend
      const pedidosRequest: PedidoRequest[] = pendientes.map((p) => ({
        uuidOffline: p.uuidOffline,
        usuarioId: p.usuarioId,
        direccionEntrega: p.direccionEntrega,
        detalles: p.detalles.map((d) => ({
          garrafaId: d.garrafaId,
          cantidad: d.cantidad,
        })),
      }));

      const request: SincronizacionRequest = { pedidos: pedidosRequest };
      const response = await firstValueFrom(
        this.http.post<SincronizacionResponse>('/api/sincronizar', request),
      );

      // Marcar los procesados como sincronizados
      for (const procesado of response.procesados) {
        await this.pedidoSrv.marcarSincronizado(procesado.uuidOffline, procesado.pedidoId);
      }

      // Marcar duplicados también como sincronizados (ya existían en el backend)
      for (const uuid of response.duplicados) {
        await this.pedidoSrv.marcarSincronizado(uuid, 0);
      }

      // Notificar resultado
      const ok = response.procesados.length;
      const dup = response.duplicados.length;
      const err = response.errores.length;

      if (ok > 0) {
        this.toast.exito(`${ok} pedido(s) sincronizado(s) con el servidor.`);
      }
      if (dup > 0) {
        this.toast.mostrar(`${dup} pedido(s) ya estaban en el servidor.`, 'info');
      }
      if (err > 0) {
        this.toast.error(`${err} pedido(s) fallaron al sincronizar.`);
      }

      return response;
    } catch (error) {
      console.error('[SyncService] Error al sincronizar:', error);
      this.toast.error('No se pudo sincronizar con el servidor.');
      return null;
    } finally {
      this.syncing = false;
    }
  }

  /** GET /api/sincronizar/estado?uuids=... — consultar estado de sincronización */
  async consultarEstado(uuids: string[]): Promise<SincronizacionEstadoResponse> {
    const params = new HttpParams().set('uuids', uuids.join(','));
    return firstValueFrom(
      this.http.get<SincronizacionEstadoResponse>('/api/sincronizar/estado', { params }),
    );
  }

  /** Descarga catálogo de garrafas y usuarios desde el backend para uso offline */
  async sincronizarDatosMaestros(): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const [garrafasResp, usuariosResp] = await Promise.all([
        this.apiGarrafa.listarTodas(),
        this.apiUsuario.listarTodos(),
      ]);

      const garrafas = garrafasResp.map(ApiGarrafaService.toLocal);
      const usuarios = usuariosResp.map(ApiUsuarioService.toLocal);

      await this.catalogo.sincronizarGarrafas(garrafas);
      await this.catalogo.sincronizarUsuarios(usuarios);
      console.log('[SyncService] Datos maestros sincronizados con éxito.');
    } catch (error) {
      console.error('[SyncService] Error al sincronizar datos maestros:', error);
    }
  }

  /** Intenta sincronizar automáticamente cuando vuelve la conexión */
  iniciarAutoSync(): void {
    window.addEventListener('online', () => {
      console.log('[SyncService] Conexión detectada, sincronizando...');
      this.sincronizarDatosMaestros();
      this.sincronizar();
    });

    // Intentar sincronizar al iniciar si hay conexión
    if (navigator.onLine) {
      setTimeout(() => {
        this.sincronizarDatosMaestros();
        this.sincronizar();
      }, 2000);
    }
  }
}
