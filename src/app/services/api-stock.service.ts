import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StockDepositoResponse, StockTotalResponse } from '../models/stock.model';

@Injectable({ providedIn: 'root' })
export class ApiStockService {
  private http = inject(HttpClient);

  async getStockDeposito(depositoId: number): Promise<StockDepositoResponse> {
    return firstValueFrom(this.http.get<StockDepositoResponse>(`/api/stock/depositos/${depositoId}`));
  }

  async getStockCamion(camionId: number): Promise<StockDepositoResponse> {
    return firstValueFrom(this.http.get<StockDepositoResponse>(`/api/stock/camiones/${camionId}`));
  }

  async getStockTotal(): Promise<StockTotalResponse> {
    return firstValueFrom(this.http.get<StockTotalResponse>('/api/stock/total'));
  }
}
