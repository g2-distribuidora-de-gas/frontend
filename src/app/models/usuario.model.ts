/** Modelo local (Dexie) — alineado con el backend UsuarioResponse */
export interface Usuario {
  id?: number;
  created_at: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  direccion: string;
  activo: boolean;
}

/** DTO que envía el backend */
export interface UsuarioResponse {
  id: number;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  dni: string;
  telefono: string;
  direccion: string;
  activo: boolean;
}

/** DTO para crear usuario en el backend */
export interface UsuarioRequest {
  nombre: string;
  apellido: string;
  dni: string;
  telefono?: string;
  direccion?: string;
  activo?: boolean;
}
