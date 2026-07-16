
export interface Cliente {
  id: string;
  /** Id numérico del backend. Null hasta que el cliente se sincroniza. */
  backendId?: number | null;
  /** false mientras está pendiente de sincronizar con el servidor. */
  sincronizado?: boolean;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  direccion: string;
  activo: boolean;
  latitud?: number | null;
  longitud?: number | null;
  placeId?: string | null;
  updatedAt: string;
}

export interface ClienteResponse {
  id: number;
  uuidOffline?: string | null;
  nombre: string;
  telefono: string | null;
  direccion: string;
  latitud?: number | null;
  longitud?: number | null;
  placeId?: string | null;
  geocodePrecision?: string | null;
  geoActualizadoEn?: string | null;
  activo: boolean;
  urlFotoEvidencia?: string | null;
}

export interface ClienteRequest {
  uuidOffline?: string;
  nombre: string;
  telefono?: string;
  direccion: string;
  latitud?: number | null;
  longitud?: number | null;
}
