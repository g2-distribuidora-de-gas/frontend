/** Tipos de depósito (backend: enum TipoDeposito) */
export type TipoDeposito = 'DEPOSITO_CENTRAL' | 'CAMION' | 'SUCURSAL' | 'PLANTA' | 'TALLER';

export const TIPO_DEPOSITO_LABELS: Record<TipoDeposito, string> = {
  DEPOSITO_CENTRAL: 'Depósito central',
  CAMION: 'Camión',
  SUCURSAL: 'Sucursal',
  PLANTA: 'Planta',
  TALLER: 'Taller',
};

export interface RepartidorResumen {
  id: number;
  nombre: string;
  email: string;
}

export interface DepositoResponse {
  id: number;
  nombre: string;
  tipo: TipoDeposito;
  descripcion?: string | null;
  activo: boolean;
  vehiculoPatente?: string | null;
  repartidor?: RepartidorResumen | null;
}


export interface DepositoRequest {
  nombre: string;
  tipo: TipoDeposito;
  descripcion?: string | null;
  vehiculoPatente?: string | null;
  repartidorId?: number | null;
}

export interface Deposito {
  id: string;
  nombre: string;
  tipo: TipoDeposito;
  descripcion: string;
  activo: boolean;
  vehiculoPatente: string;
  repartidorId: number | null;
  repartidorNombre: string;
  repartidorEmail: string;
  updatedAt: string;
}

export function depositoToLocal(r: DepositoResponse): Deposito {
  return {
    id: String(r.id),
    nombre: r.nombre,
    tipo: r.tipo,
    descripcion: r.descripcion ?? '',
    activo: r.activo,
    vehiculoPatente: r.vehiculoPatente ?? '',
    repartidorId: r.repartidor?.id ?? null,
    repartidorNombre: r.repartidor?.nombre ?? '',
    repartidorEmail: r.repartidor?.email ?? '',
    updatedAt: new Date().toISOString(),
  };
}
