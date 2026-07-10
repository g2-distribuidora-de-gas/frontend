import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Cliente, ClienteRequest, ClienteResponse } from '../models/cliente.model';

@Injectable({ providedIn: 'root' })
export class ApiClienteService {
  private http = inject(HttpClient);

  /** GET /api/clientes */
  async listarTodos(): Promise<ClienteResponse[]> {
    return firstValueFrom(this.http.get<ClienteResponse[]>('/api/clientes'));
  }

  /** POST /api/clientes */
  async crear(request: ClienteRequest): Promise<ClienteResponse> {
    return firstValueFrom(this.http.post<ClienteResponse>('/api/clientes', request));
  }

  /** PUT /api/clientes/:id */
  async actualizar(id: number, request: ClienteRequest): Promise<ClienteResponse> {
    return firstValueFrom(this.http.put<ClienteResponse>(`/api/clientes/${id}`, request));
  }


  static toLocal(resp: ClienteResponse): Cliente {
    return {
      id: String(resp.id),
      nombre: resp.nombre,
      apellido: '',
      dni: '',
      telefono: resp.telefono ?? '',
      direccion: resp.direccion,
      activo: resp.activo ?? true,
      latitud: resp.latitud ?? null,
      longitud: resp.longitud ?? null,
      placeId: resp.placeId ?? null,
      updatedAt: new Date().toISOString(),
    };
  }
}
