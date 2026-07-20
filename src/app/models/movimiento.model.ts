import type { TipoGarrafaStockResponse } from './garrafa.model';
import type { EstadoGarrafa } from './estado-garrafa.model';

export type TipoMovimiento =
  | 'VENTA'
  | 'DEVOLUCION'
  | 'TRANSFERENCIA'
  | 'CARGA_CAMION'
  | 'DESCARGA_CAMION'
  | 'AJUSTE_ENTRADA'
  | 'AJUSTE_SALIDA'
  | 'ROTURA'
  | 'REPARACION_INICIO'
  | 'REPARACION_FIN';

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
  TRANSFERENCIA: 'Transferencia',
  CARGA_CAMION: 'Carga de camión',
  DESCARGA_CAMION: 'Descarga de camión',
  AJUSTE_ENTRADA: 'Ajuste (entrada)',
  AJUSTE_SALIDA: 'Ajuste (salida)',
  ROTURA: 'Rotura',
  REPARACION_INICIO: 'Envío a reparación',
  REPARACION_FIN: 'Retorno de reparación',
};

export interface DepositoResumen {
  id: number;
  nombre: string;
  tipo: string;
}

export interface UsuarioResumen {
  id: number;
  nombre: string;
  email: string;
}

export interface MovimientoResponse {
  id: number;
  tipoMovimiento: TipoMovimiento;
  depositoOrigen?: DepositoResumen | null;
  depositoDestino?: DepositoResumen | null;
  tipoGarrafa: TipoGarrafaStockResponse;
  estadoOrigen?: EstadoGarrafa | null;
  estadoDestino?: EstadoGarrafa | null;
  cantidad: number;
  pedidoId?: number | null;
  usuario?: UsuarioResumen | null;
  fecha: string;
  observaciones?: string | null;
}

export interface MovimientoPageResponse {
  content: MovimientoResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface TransferenciaRequest {
  depositoOrigenId: number;
  depositoDestinoId: number;
  tipoGarrafaId: number;
  estadoGarrafaId: number;
  cantidad: number;
  observaciones?: string;
}

export interface ItemCarga {
  tipoGarrafaId: number;
  cantidad: number;
}

export interface CargaCamionRequest {
  camionId: number;
  depositoCentralId: number;
  items: ItemCarga[];
  observaciones?: string;
}

export interface ItemDescarga {
  tipoGarrafaId: number;
  estadoGarrafaId: number;
  cantidad: number;
}

export interface DescargaCamionRequest {
  camionId: number;
  depositoCentralId: number;
  items: ItemDescarga[];
  observaciones?: string;
}

export interface VentaStockRequest {
  camionId: number;
  tipoGarrafaId: number;
  cantidadEntregadas: number;
  cantidadRecibidas: number;
  pedidoId?: number;
  observaciones?: string;
}

export interface DevolucionRequest {
  depositoDestinoId: number;
  tipoGarrafaId: number;
  estadoGarrafaId: number;
  cantidad: number;
  pedidoId?: number;
  observaciones?: string;
}

export interface RoturaRequest {
  depositoId: number;
  tipoGarrafaId: number;
  estadoGarrafaId: number;
  cantidad: number;
  observaciones: string;
}

export interface ReparacionInicioRequest {
  depositoOrigenId: number;
  tallerDestinoId: number;
  tipoGarrafaId: number;
  estadoOrigenId: number;
  cantidad: number;
  observaciones?: string;
}

export interface ReparacionFinRequest {
  tallerId: number;
  tipoGarrafaId: number;
  cantidad: number;
  estadoFinalId: number;
  observaciones?: string;
}

export type TipoAjuste = 'ENTRADA' | 'SALIDA';

export interface AjusteInventarioRequest {
  depositoId: number;
  tipoGarrafaId: number;
  estadoGarrafaId: number;
  cantidad: number;
  tipoAjuste: TipoAjuste;
  observaciones: string; 
}


export interface MovimientoFiltro {
  depositoId?: number;
  tipoGarrafaId?: number;
  tipoMovimiento?: TipoMovimiento;
  desde?: string;
  hasta?: string;
  page?: number;
  size?: number;
}
