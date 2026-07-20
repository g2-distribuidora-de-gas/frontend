export type CodigoGarrafa = string; 

export interface Garrafa {
  id: string;
  codigo: CodigoGarrafa;
  descripcion: string;
  capacidadKg: number;
  precio: number;
  activo: boolean;
  updatedAt: string;
}

export interface TipoGarrafaStockResponse {
  id: number;
  codigo: string;
  descripcion: string;
  capacidadKg: number;
  activo: boolean;
  precio?: number;
}

export interface TipoGarrafaStockRequest {
  codigo: string;
  descripcion: string;
  capacidadKg: number;
  precio?: number;
}

const NOMBRES_CONOCIDOS: Record<string, string> = {
  '10KG': 'Garrafa 10 kg',
  '15KG': 'Garrafa 15 kg',
  '45KG': 'Garrafa 45 kg',
  GARRAFA_10KG: 'Garrafa 10 kg',
  GARRAFA_15KG: 'Garrafa 15 kg',
  GARRAFA_45KG: 'Garrafa 45 kg',
};

export function nombreGarrafa(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return NOMBRES_CONOCIDOS[codigo] ?? codigo;
}
