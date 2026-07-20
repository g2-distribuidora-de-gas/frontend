import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {Garrafa,TipoGarrafaStockRequest,TipoGarrafaStockResponse} from '../models/garrafa.model';
import { EstadoGarrafa } from '../models/estado-garrafa.model';

@Injectable({ providedIn: 'root' })
export class ApiGarrafaService {
  private http = inject(HttpClient);

  async listarTodas(soloActivos = false): Promise<TipoGarrafaStockResponse[]> {
    const params = new HttpParams().set('soloActivos', String(soloActivos));
    return firstValueFrom(
      this.http.get<TipoGarrafaStockResponse[]>('/api/tipos-garrafa-stock', { params }),
    );
  }

  async crear(request: TipoGarrafaStockRequest): Promise<TipoGarrafaStockResponse> {
    return firstValueFrom(
      this.http.post<TipoGarrafaStockResponse>('/api/tipos-garrafa-stock', request),
    );
  }

  async actualizar(id: number, request: TipoGarrafaStockRequest): Promise<TipoGarrafaStockResponse> {
    return firstValueFrom(
      this.http.put<TipoGarrafaStockResponse>(`/api/tipos-garrafa-stock/${id}`, request),
    );
  }

  async cambiarEstado(id: number, activo: boolean): Promise<TipoGarrafaStockResponse> {
    const params = new HttpParams().set('activo', String(activo));
    return firstValueFrom(
      this.http.patch<TipoGarrafaStockResponse>(`/api/tipos-garrafa-stock/${id}/estado`, null, { params }),
    );
  }

  async listarEstados(): Promise<EstadoGarrafa[]> {
    return firstValueFrom(this.http.get<EstadoGarrafa[]>('/api/tipos-garrafa-stock/estados'));
  }

  static toLocal(resp: TipoGarrafaStockResponse): Garrafa {
    return {
      id: String(resp.id),
      codigo: resp.codigo,
      descripcion: resp.descripcion,
      capacidadKg: resp.capacidadKg,
      precio: resp.precio ?? 0,
      activo: resp.activo,
      updatedAt: new Date().toISOString(),
    };
  }
}
