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

  /** Convierte un UsuarioResponse del backend a modelo local (Dexie) */
  static toLocal(resp: UsuarioResponse): Usuario {
    return {
      id: resp.id,
      created_at: new Date().toISOString(),
      nombre: resp.nombre,
      apellido: resp.apellido,
      dni: resp.dni,
      telefono: resp.telefono ?? '',
      direccion: resp.direccion ?? '',
      activo: resp.activo,
    };
  }
}
