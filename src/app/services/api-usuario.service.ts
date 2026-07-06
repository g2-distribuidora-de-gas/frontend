import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Usuario, UsuarioRequest, UsuarioResponse } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class ApiUsuarioService {
  private http = inject(HttpClient);

  /** GET /api/usuarios */
  async listarTodos(): Promise<UsuarioResponse[]> {
    return firstValueFrom(this.http.get<UsuarioResponse[]>('/api/usuarios'));
  }

  /** POST /api/usuarios */
  async crear(request: UsuarioRequest): Promise<UsuarioResponse> {
    return firstValueFrom(this.http.post<UsuarioResponse>('/api/usuarios', request));
  }

  /** DELETE /api/usuarios/:id — baja lógica en el backend */
  async eliminar(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/usuarios/${id}`));
  }

  /** PUT /api/usuarios/:id — actualizar usuario (se usa para reactivar) */
  async actualizar(id: number, request: UsuarioRequest): Promise<UsuarioResponse> {
    return firstValueFrom(this.http.put<UsuarioResponse>(`/api/usuarios/${id}`, request));
  }

  /** PATCH /api/usuarios/:id/reactivar — reactiva lógicamente un usuario */
  async reactivar(id: number): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/usuarios/${id}/reactivar`, {}));
  }

  /** Convierte un UsuarioResponse del backend a modelo local (RxDB) */
  static toLocal(resp: UsuarioResponse): Usuario {
    return {
      id: String(resp.id),
      nombre: resp.nombre,
      apellido: resp.apellido,
      dni: resp.dni,
      telefono: resp.telefono ?? '',
      direccion: resp.direccion ?? '',
      activo: resp.activo,
      updatedAt: new Date().toISOString(),
    };
  }
}
