export interface Producto {
  id?: number;
  created_at: string;
  nombre: string;
  capacidad_kg: number;
  precio_actual: number;
  activo: boolean;
  tipo: string;
}
