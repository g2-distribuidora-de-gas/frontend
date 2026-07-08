
export interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  direccion: string;
  /**  (el backend no soporta desactivar clientes) */
  activo: boolean;

  latitud?: number | null;
  longitud?: number | null;
  placeId?: string | null;
  updatedAt: string;
}

export interface ClienteResponse {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string;
  latitud?: number | null;
  longitud?: number | null;
  placeId?: string | null;
  geoActualizadoEn?: string | null;
}

export interface ClienteRequest {
  nombre: string;
  telefono?: string;
  direccion: string;
}
