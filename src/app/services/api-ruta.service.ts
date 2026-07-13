import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {EstadoEntrega, EstadoRuta, RutaPlanificarRequest, RutaResponse} from '../models/ruta.model';


@Injectable({ providedIn: 'root' })
export class ApiRutaService {
  private http = inject(HttpClient);

  async planificar(request: RutaPlanificarRequest): Promise<RutaResponse> {
    return firstValueFrom(this.http.post<RutaResponse>('/api/rutas/planificar', request));
  }
  async obtenerMiRutaActiva(repartidorId: number): Promise<RutaResponse> {
    return firstValueFrom(
      this.http.get<RutaResponse>(`/api/rutas/mis-rutas/${repartidorId}`),
    );
  }

  async actualizarEstadoParada(
    rutaPedidoId: number,
    nuevoEstado: EstadoEntrega,
  ): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`/api/rutas/paradas/${rutaPedidoId}`, { nuevoEstado }),
    );
  }

  async cambiarEstadoRuta(rutaId: number, estado: EstadoRuta): Promise<RutaResponse> {
    const params = new HttpParams().set('estado', estado);
    return firstValueFrom(
      this.http.patch<RutaResponse>(`/api/rutas/${rutaId}/estado`, null, { params }),
    );
  }
}
