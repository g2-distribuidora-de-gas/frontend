import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {AjusteInventarioRequest,CargaCamionRequest,DescargaCamionRequest,DevolucionRequest,MovimientoFiltro,MovimientoPageResponse,MovimientoResponse,ReparacionFinRequest,
  ReparacionInicioRequest,RoturaRequest,TransferenciaRequest,VentaStockRequest} from '../models/movimiento.model';

@Injectable({ providedIn: 'root' })
export class ApiMovimientoService {
  private http = inject(HttpClient);
  private base = '/api/stock/movimientos';

  async listarHistorial(filtro: MovimientoFiltro = {}): Promise<MovimientoPageResponse> {
    let params = new HttpParams();
    if (filtro.depositoId != null) params = params.set('depositoId', String(filtro.depositoId));
    if (filtro.tipoGarrafaId != null) params = params.set('tipoGarrafaId', String(filtro.tipoGarrafaId));
    if (filtro.tipoMovimiento) params = params.set('tipoMovimiento', filtro.tipoMovimiento);
    if (filtro.desde) params = params.set('desde', filtro.desde);
    if (filtro.hasta) params = params.set('hasta', filtro.hasta);
    params = params.set('page', String(filtro.page ?? 0));
    params = params.set('size', String(filtro.size ?? 50));
    return firstValueFrom(this.http.get<MovimientoPageResponse>(this.base, { params }));
  }

  async porPedido(pedidoId: number): Promise<MovimientoResponse[]> {
    return firstValueFrom(this.http.get<MovimientoResponse[]>(`${this.base}/pedido/${pedidoId}`));
  }

  async transferir(req: TransferenciaRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/transferir`, req));
  }

  async cargarCamion(req: CargaCamionRequest): Promise<MovimientoResponse[]> {
    return firstValueFrom(this.http.post<MovimientoResponse[]>(`${this.base}/carga-camion`, req));
  }

  async descargarCamion(req: DescargaCamionRequest): Promise<MovimientoResponse[]> {
    return firstValueFrom(this.http.post<MovimientoResponse[]>(`${this.base}/descarga-camion`, req));
  }

  async registrarVenta(req: VentaStockRequest): Promise<MovimientoResponse[]> {
    return firstValueFrom(this.http.post<MovimientoResponse[]>(`${this.base}/venta`, req));
  }

  async registrarDevolucion(req: DevolucionRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/devolucion`, req));
  }

  async registrarRotura(req: RoturaRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/rotura`, req));
  }

  async iniciarReparacion(req: ReparacionInicioRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/reparacion/iniciar`, req));
  }

  async finalizarReparacion(req: ReparacionFinRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/reparacion/finalizar`, req));
  }

  async ajustar(req: AjusteInventarioRequest): Promise<MovimientoResponse> {
    return firstValueFrom(this.http.post<MovimientoResponse>(`${this.base}/ajuste`, req));
  }
}
