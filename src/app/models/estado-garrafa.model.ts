export interface EstadoGarrafa {
  id: number;
  codigo: string; 
  descripcion?: string;
  activo: boolean;
}

export const ESTADO_GARRAFA_LABELS: Record<string, string> = {
  LLENA: 'Llena',
  VACIA: 'Vacía',
  RESERVADA: 'Reservada',
  REPARACION: 'En reparación',
  FUERA_SERVICIO: 'Fuera de servicio',
};

export function nombreEstadoGarrafa(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return ESTADO_GARRAFA_LABELS[codigo] ?? codigo;
}
