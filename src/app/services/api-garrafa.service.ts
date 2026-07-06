import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Garrafa, GarrafaRequest, GarrafaResponse } from '../models/garrafa.model';

@Injectable({ providedIn: 'root' })
export class ApiGarrafaService {
  private http = inject(HttpClient);

  /** GET /api/garrafas */
  async listarTodas(): Promise<GarrafaResponse[]> {
    return firstValueFrom(this.http.get<GarrafaResponse[]>('/api/garrafas'));
  }

  /** POST /api/garrafas */
  async crear(request: GarrafaRequest): Promise<GarrafaResponse> {
    return firstValueFrom(this.http.post<GarrafaResponse>('/api/garrafas', request));
  }

  /** Convierte un GarrafaResponse del backend a modelo local (RxDB) */
  static toLocal(resp: GarrafaResponse): Garrafa {
    return {
      id: String(resp.id),
      tipo: resp.tipo,
      capacidadKg: resp.capacidadKg,
      precio: resp.precio,
      stockDisponible: resp.stockDisponible,
      activo: resp.activo,
      updatedAt: new Date().toISOString(),
    };
  }
}
