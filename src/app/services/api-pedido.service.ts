import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PedidoRequest, PedidoResponse } from '../models/pedido.model';

@Injectable({ providedIn: 'root' })
export class ApiPedidoService {
  private http = inject(HttpClient);

  /** POST /api/pedidos — crear un pedido individual (online) */
  async crear(request: PedidoRequest): Promise<PedidoResponse> {
    return firstValueFrom(this.http.post<PedidoResponse>('/api/pedidos', request));
  }

  /** GET /api/pedidos — listar todos los pedidos */
  async listarTodos(): Promise<PedidoResponse[]> {
    return firstValueFrom(this.http.get<PedidoResponse[]>('/api/pedidos'));
  }

  /** GET /api/pedidos/:id — obtener pedido por ID */
  async obtenerPorId(id: number): Promise<PedidoResponse> {
    return firstValueFrom(this.http.get<PedidoResponse>(`/api/pedidos/${id}`));
  }

  /** GET /api/pedidos/uuid/:uuidOffline — obtener por UUID offline */
  async obtenerPorUuidOffline(uuidOffline: string): Promise<PedidoResponse> {
    return firstValueFrom(this.http.get<PedidoResponse>(`/api/pedidos/uuid/${uuidOffline}`));
  }

  /** PATCH /api/pedidos/:id/estado — cambiar estado */
  async cambiarEstado(id: number, estado: string): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/pedidos/${id}/estado`, null, { params: { estado } }));
  }
}
