import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ActualizarNotasAdminRequest,
  ActualizarParadaRequest,
  AgendaRepartidorResponse,
  ConfirmarTurnoRequest,
  DeliveryReadOnlyResponse,
  EstadoEntrega,
  EstadoRuta,
  RutaPlanificarRequest,
  RutaResponse,
  SincronizacionParadasRequest,
  SincronizacionParadasResponse,
  SincronizacionRutasRequest,
  SincronizacionRutasResponse,
} from '../models/ruta.model';


@Injectable({ providedIn: 'root' })
export class ApiRutaService {
  private http = inject(HttpClient);

  async planificar(request: RutaPlanificarRequest): Promise<RutaResponse> {
    return firstValueFrom(this.http.post<RutaResponse>('/api/rutas/planificar', request));
  }

  /** GET /api/rutas — todas las rutas (uso administrativo). */
  async listarTodas(): Promise<RutaResponse[]> {
    return firstValueFrom(this.http.get<RutaResponse[]>('/api/rutas'));
  }

  async obtenerMiRutaActiva(repartidorId: number): Promise<RutaResponse> {
    return firstValueFrom(
      this.http.get<RutaResponse>(`/api/rutas/mis-rutas/${repartidorId}`),
    );
  }

  async actualizarEstadoParada(
    rutaPedidoId: number,
    nuevoEstado: EstadoEntrega,
    motivoFallo?: string,
  ): Promise<void> {
    const body: ActualizarParadaRequest = { nuevoEstado };
    if (motivoFallo != null && motivoFallo.trim() !== '') {
      body.motivoFallo = motivoFallo.trim();
    }
    return firstValueFrom(
      this.http.patch<void>(`/api/rutas/paradas/${rutaPedidoId}`, body),
    );
  }

  async cambiarEstadoRuta(rutaId: number, estado: EstadoRuta): Promise<RutaResponse> {
    const params = new HttpParams().set('estado', estado);
    return firstValueFrom(
      this.http.patch<RutaResponse>(`/api/rutas/${rutaId}/estado`, null, { params }),
    );
  }

  async obtenerPedidoDeParada(rutaPedidoId: number): Promise<DeliveryReadOnlyResponse> {
    return firstValueFrom(
      this.http.get<DeliveryReadOnlyResponse>(`/api/rutas/paradas/${rutaPedidoId}/pedido`),
    );
  }

  async sincronizarParadas(
    request: SincronizacionParadasRequest,
  ): Promise<SincronizacionParadasResponse> {
    return firstValueFrom(
      this.http.post<SincronizacionParadasResponse>('/api/sincronizar/paradas', request),
    );
  }

  async sincronizarRutas(
    request: SincronizacionRutasRequest,
  ): Promise<SincronizacionRutasResponse> {
    return firstValueFrom(
      this.http.post<SincronizacionRutasResponse>('/api/sincronizar/rutas', request),
    );
  }

  // ── Agenda ─────────────────────────────────────────────────────────────

  /** GET /api/rutas/agenda/{repartidorId}?desde=YYYY-MM-DD&hasta=YYYY-MM-DD */
  async obtenerAgenda(
    repartidorId: number,
    desde: string,
    hasta: string,
  ): Promise<AgendaRepartidorResponse[]> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return firstValueFrom(
      this.http.get<AgendaRepartidorResponse[]>(`/api/rutas/agenda/${repartidorId}`, { params }),
    );
  }

  /** PATCH /api/rutas/{rutaId}/confirmar — repartidor acepta o rechaza el turno */
  async confirmarTurno(
    rutaId: number,
    request: ConfirmarTurnoRequest,
  ): Promise<AgendaRepartidorResponse> {
    return firstValueFrom(
      this.http.patch<AgendaRepartidorResponse>(`/api/rutas/${rutaId}/confirmar`, request),
    );
  }

  /** PATCH /api/rutas/{rutaId}/notas-admin — admin agrega/edita notas visibles al repartidor */
  async actualizarNotasAdmin(
    rutaId: number,
    request: ActualizarNotasAdminRequest,
  ): Promise<AgendaRepartidorResponse> {
    return firstValueFrom(
      this.http.patch<AgendaRepartidorResponse>(`/api/rutas/${rutaId}/notas-admin`, request),
    );
  }
}
