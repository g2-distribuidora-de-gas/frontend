export interface Cliente {
  id?: number;
  created_at: string;
  nombre: string;
  apellido: string;
  telefono: number;
  email: string;
  activo: boolean;
  direccion: string;
}
