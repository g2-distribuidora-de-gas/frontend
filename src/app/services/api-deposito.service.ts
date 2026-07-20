import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DepositoRequest, DepositoResponse, TipoDeposito } from '../models/deposito.model';

@Injectable({ providedIn: 'root' })
export class ApiDepositoService {
  private http = inject(HttpClient);

  async listar(opts?: { tipo?: TipoDeposito; soloActivos?: boolean }): Promise<DepositoResponse[]> {
    let params = new HttpParams();
    if (opts?.tipo) params = params.set('tipo', opts.tipo);
    if (opts?.soloActivos != null) params = params.set('soloActivos', String(opts.soloActivos));
    return firstValueFrom(this.http.get<DepositoResponse[]>('/api/depositos', { params }));
  }

  async obtener(id: number): Promise<DepositoResponse> {
    return firstValueFrom(this.http.get<DepositoResponse>(`/api/depositos/${id}`));
  }

  async crear(request: DepositoRequest): Promise<DepositoResponse> {
    return firstValueFrom(this.http.post<DepositoResponse>('/api/depositos', request));
  }

  async actualizar(id: number, request: DepositoRequest): Promise<DepositoResponse> {
    return firstValueFrom(this.http.put<DepositoResponse>(`/api/depositos/${id}`, request));
  }

  async cambiarEstado(id: number, activo: boolean): Promise<DepositoResponse> {
    const params = new HttpParams().set('activo', String(activo));
    return firstValueFrom(
      this.http.patch<DepositoResponse>(`/api/depositos/${id}/estado`, null, { params }),
    );
  }
}
