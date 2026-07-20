import type { DepositoResponse } from './deposito.model';

export interface StockItem {
  tipoGarrafa: string; 
  estado: string;      
  cantidad: number;
}

export interface StockDepositoResponse {
  deposito: DepositoResponse;
  stock: StockItem[];
  consultadoEn: string;
}

export interface StockTotalResponse {
  stock: StockItem[];
  depositosIncluidos: number;
  consultadoEn: string;
}
