/** Tipos de garrafa alineados con el enum TipoGarrafa del backend */
export type TipoGarrafa = 'GARRAFA_10KG' | 'GARRAFA_15KG' | 'GARRAFA_45KG';

/** Modelo local (Dexie) — alineado con el backend GarrafaResponse */
export interface Garrafa {
  id?: number;
  created_at: string;
  tipo: TipoGarrafa;
  capacidadKg: number;
  precio: number;
  stockDisponible: number;
  activo: boolean;
}

/** DTO que envía el backend */
export interface GarrafaResponse {
  id: number;
  tipo: TipoGarrafa;
  capacidadKg: number;
  precio: number;
  stockDisponible: number;
  activo: boolean;
}

/** DTO para crear garrafa en el backend */
export interface GarrafaRequest {
  tipo: TipoGarrafa;
  capacidadKg: number;
  precio: number;
  stockDisponible: number;
  activo?: boolean;
}

/** Helper para mostrar el nombre legible del tipo */
export function nombreGarrafa(tipo: TipoGarrafa): string {
  switch (tipo) {
    case 'GARRAFA_10KG': return 'Garrafa 10 kg';
    case 'GARRAFA_15KG': return 'Garrafa 15 kg';
    case 'GARRAFA_45KG': return 'Garrafa 45 kg';
    default: return tipo;
  }
}
