import { Injectable, Signal, inject, signal } from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { RxDatabaseService } from './rx-database.service';
import { ApiRutaService } from './api-ruta.service';
import { ToastService } from './toast.service';
import { EstadoEntrega, EstadoRuta, ParadaDetalleOffline, RutaClienteResponse, RutaOfflineView,
  RutaPedidoOffline, RutaResponse, SincronizacionParadaItem} from '../models/ruta.model';
import { EstadoPedido } from '../models/pedido.model';
import { RutaDocType } from '../schemas/ruta.schema';
import { EventoParadaDocType } from '../schemas/evento-parada.schema';
import { EventoRutaDocType } from '../schemas/evento-ruta.schema';


@Injectable({ providedIn: 'root' })
export class RepartoOfflineService {
  private rxDb = inject(RxDatabaseService);
  private api = inject(ApiRutaService);
  private toast = inject(ToastService);

  private readonly _ruta = signal<RutaOfflineView | null>(null);
  private readonly _pendientes = signal(0);
  private readonly _sincronizando = signal(false);
  private readonly _refrescando = signal(false);

  readonly ruta: Signal<RutaOfflineView | null> = this._ruta.asReadonly();
  readonly pendientes = this._pendientes.asReadonly();
  readonly sincronizando = this._sincronizando.asReadonly();
  readonly refrescando = this._refrescando.asReadonly();

  private repartidorId: number | null = null;
  private sub?: Subscription;
  private iniciada = false;
  private onlineListener?: () => void;


  async iniciar(repartidorId: number): Promise<void> {
    this.repartidorId = repartidorId;
    if (!this.iniciada) {
      this.iniciada = true;
      this.suscribirVistaReactiva();
      this.onlineListener = () => void this.flush();
      window.addEventListener('online', this.onlineListener);
    }
    await this.refrescarRuta();
    void this.flush();
  }

  async cancelar(): Promise<void> {
    this.sub?.unsubscribe();
    this.sub = undefined;
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = undefined;
    }
    this.iniciada = false;
    this.repartidorId = null;
    this._ruta.set(null);
    this._pendientes.set(0);
  }

  private suscribirVistaReactiva(): void {
    const rutas$ = this.rxDb.rutas.find().$;
    const evParada$ = this.rxDb.eventosParada.find({ selector: { sincronizado: false } }).$;
    const evRuta$ = this.rxDb.eventosRuta.find({ selector: { sincronizado: false } }).$;

    this.sub = combineLatest([rutas$, evParada$, evRuta$]).subscribe(([rutas, evP, evR]) => {
      const eventosP = evP.map((d) => d.toJSON() as EventoParadaDocType);
      const eventosR = evR.map((d) => d.toJSON() as EventoRutaDocType);
      this._pendientes.set(eventosP.length + eventosR.length);
      this._ruta.set(
        this.merge(
          rutas.map((d) => d.toJSON() as RutaDocType),
          eventosP,
          eventosR,
        ),
      );
    });
  }

  private merge(
    rutas: RutaDocType[],
    evP: EventoParadaDocType[],
    evR: EventoRutaDocType[],
  ): RutaOfflineView | null {
    const id = this.repartidorId;
    const doc = rutas.find((r) => id == null || r.repartidorId === id) ?? rutas[0];
    if (!doc) return null;

    const ultParada = new Map<number, EventoParadaDocType>();
    for (const e of [...evP].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      ultParada.set(e.rutaPedidoId, e);
    }
    const ultRuta = [...evR]
      .filter((e) => String(e.rutaId) === doc.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .pop();

    const paradas: RutaPedidoOffline[] = (doc.paradas ?? []).map((p) => {
      const ev = ultParada.get(p.id);
      return {
        id: p.id,
        pedidoId: p.pedidoId,
        orden: p.orden,
        distanciaDesdeAnteriorM: p.distanciaDesdeAnteriorM ?? null,
        duracionDesdeAnteriorS: p.duracionDesdeAnteriorS ?? null,
        estadoEntrega: (ev?.nuevoEstado as EstadoEntrega) ?? (p.estadoEntrega as EstadoEntrega),
        motivoFallo: ev ? ev.motivoFallo || null : p.motivoFallo ?? null,
        cliente: (p.cliente ? { ...p.cliente } : null) as RutaClienteResponse | null,
        pendiente: !!ev,
        estadoPedido: (p.estadoPedido as EstadoPedido | null) ?? null,
        totalPedido: p.totalPedido ?? null,
        detalles: (p.detalles as ParadaDetalleOffline[]) ?? [],
      };
    });

    return {
      id: Number(doc.id),
      fechaReparto: doc.fechaReparto,
      repartidorId: doc.repartidorId,
      origenLat: doc.origenLat ?? null,
      origenLng: doc.origenLng ?? null,
      distanciaTotalM: doc.distanciaTotalM ?? null,
      duracionTotalS: doc.duracionTotalS ?? null,
      geometria: doc.geometria ?? null,
      estado: (ultRuta?.nuevoEstado as EstadoRuta) ?? (doc.estado as EstadoRuta),
      paradas,
      pendiente: !!ultRuta,
    };
  }


  async refrescarRuta(): Promise<void> {
    const id = this.repartidorId;
    if (id == null || !navigator.onLine) return;
    this._refrescando.set(true);
    try {
      const ruta = await this.api.obtenerMiRutaActiva(id);
      await this.guardarRutaEnCache(ruta);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 404 || status === 400) {
        await this.limpiarCacheRuta();
      }
    } finally {
      this._refrescando.set(false);
    }
  }

  private async guardarRutaEnCache(ruta: RutaResponse): Promise<void> {
    const rutaIdStr = String(ruta.id);

    const evParadaPend = await this.rxDb.eventosParada.find({ selector: { sincronizado: false } }).exec();
    const pendPorParada = new Map<number, EventoParadaDocType>();
    for (const e of evParadaPend) {
      const j = e.toJSON() as EventoParadaDocType;
      pendPorParada.set(j.rutaPedidoId, j);
    }
    const prevDoc = await this.rxDb.rutas.findOne(rutaIdStr).exec();
    const prevParadas = new Map<number, RutaDocType['paradas'][number]>();
    if (prevDoc) {
      for (const p of (prevDoc.toJSON() as RutaDocType).paradas ?? []) prevParadas.set(p.id, p);
    }

    const paradas: RutaDocType['paradas'] = [];
    for (const p of ruta.paradas) {
      let detalles: ParadaDetalleOffline[] = [];
      let estadoPedido: EstadoPedido | null = null;
      let totalPedido: number | null = null;
      try {
        const det = await this.api.obtenerPedidoDeParada(p.id);
        detalles = (det.detalles ?? []).map((d) => ({
          garrafaTipo: d.garrafaTipo,
          cantidad: d.cantidad,
          precioUnitario: Number(d.precioUnitario),
          subtotal: Number(d.subtotal),
        }));
        estadoPedido = det.estado ?? null;
        totalPedido = detalles.reduce((s, d) => s + (d.subtotal ?? 0), 0);
      } catch {
        const prev = prevParadas.get(p.id);
        if (prev) {
          detalles = (prev.detalles as ParadaDetalleOffline[]) ?? [];
          estadoPedido = (prev.estadoPedido as EstadoPedido | null) ?? null;
          totalPedido = prev.totalPedido ?? null;
        }
      }

      const ev = pendPorParada.get(p.id);
      paradas.push({
        id: p.id,
        pedidoId: p.pedidoId,
        orden: p.orden,
        distanciaDesdeAnteriorM: p.distanciaDesdeAnteriorM ?? null,
        duracionDesdeAnteriorS: p.duracionDesdeAnteriorS ?? null,
        estadoEntrega: ev ? ev.nuevoEstado : p.estadoEntrega,
        motivoFallo: ev ? ev.motivoFallo || null : p.motivoFallo ?? null,
        estadoPedido,
        totalPedido,
        cliente: p.cliente ? { ...p.cliente } : null,
        detalles,
      });
    }

    const evRutaPend = (await this.rxDb.eventosRuta.find({ selector: { sincronizado: false } }).exec())
      .map((d) => d.toJSON() as EventoRutaDocType)
      .filter((e) => String(e.rutaId) === rutaIdStr)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const evRuta = evRutaPend.length ? evRutaPend[evRutaPend.length - 1] : undefined;

    await this.rxDb.rutas.upsert({
      id: rutaIdStr,
      repartidorId: ruta.repartidorId,
      fechaReparto: ruta.fechaReparto,
      origenLat: ruta.origenLat ?? null,
      origenLng: ruta.origenLng ?? null,
      distanciaTotalM: ruta.distanciaTotalM ?? null,
      duracionTotalS: ruta.duracionTotalS ?? null,
      geometria: ruta.geometria ?? null,
      estado: evRuta ? evRuta.nuevoEstado : ruta.estado,
      paradas,
      updatedAt: new Date().toISOString(),
    });

    const otras = await this.rxDb.rutas.find({ selector: { id: { $ne: rutaIdStr } } }).exec();
    for (const o of otras) await o.remove();
  }

  private async limpiarCacheRuta(): Promise<void> {
    const docs = await this.rxDb.rutas.find().exec();
    for (const d of docs) await d.remove();
  }

  async marcarParada(
    rutaPedidoId: number,
    nuevoEstado: EstadoEntrega,
    motivoFallo?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const pend = await this.rxDb.eventosParada.find({ selector: { sincronizado: false } }).exec();
    const yaEncolada = pend.some((e) => (e.toJSON() as EventoParadaDocType).rutaPedidoId === rutaPedidoId);
    if (!yaEncolada) {
      await this.rxDb.eventosParada.insert({
        uuidOffline: crypto.randomUUID(),
        rutaPedidoId,
        nuevoEstado,
        motivoFallo: motivoFallo ?? '',
        sincronizado: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    await this.actualizarParadaEnCache(rutaPedidoId, nuevoEstado, motivoFallo);
    void this.flush();
  }

  private async actualizarParadaEnCache(
    rutaPedidoId: number,
    estado: EstadoEntrega,
    motivoFallo?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const docs = await this.rxDb.rutas.find().exec();
    for (const doc of docs) {
      const j = doc.toJSON() as RutaDocType;
      if (!(j.paradas ?? []).some((p) => p.id === rutaPedidoId)) continue;
      const paradas = j.paradas.map((p) =>
        p.id === rutaPedidoId
          ? {
              ...p,
              estadoEntrega: estado,
              motivoFallo: estado === 'FALLIDO' ? motivoFallo ?? p.motivoFallo ?? null : p.motivoFallo ?? null,
              estadoPedido:
                estado === 'ENTREGADO'
                  ? 'ENTREGADO'
                  : estado === 'FALLIDO'
                    ? 'REPROGRAMADO'
                    : p.estadoPedido ?? null,
            }
          : p,
      );
      await doc.patch({ paradas, updatedAt: now });
    }
  }

  async cambiarEstadoRuta(rutaId: number, nuevoEstado: EstadoRuta): Promise<void> {
    const now = new Date().toISOString();
    await this.rxDb.eventosRuta.insert({
      uuidOffline: crypto.randomUUID(),
      rutaId,
      nuevoEstado,
      sincronizado: false,
      createdAt: now,
      updatedAt: now,
    });
    const doc = await this.rxDb.rutas.findOne(String(rutaId)).exec();
    if (doc) await doc.patch({ estado: nuevoEstado, updatedAt: now });
    void this.flush();
  }


  async sincronizarAhora(): Promise<void> {
    await this.flush();
  }

  async flush(): Promise<void> {
    if (!navigator.onLine || this._sincronizando()) return;
    this._sincronizando.set(true);
    try {
      await this.flushRutas();
      await this.flushParadas();
      await this.refrescarRuta();
    } catch {
    } finally {
      this._sincronizando.set(false);
    }
  }

  private async flushRutas(): Promise<void> {
    const pendDocs = (await this.rxDb.eventosRuta.find({ selector: { sincronizado: false } }).exec()).sort(
      (a, b) => (a.toJSON() as EventoRutaDocType).createdAt.localeCompare((b.toJSON() as EventoRutaDocType).createdAt),
    );
    for (const doc of pendDocs) {
      const e = doc.toJSON() as EventoRutaDocType;
      const resp = await this.api.sincronizarRutas({
        cambios: [{ rutaId: e.rutaId, uuidOffline: e.uuidOffline, nuevoEstado: e.nuevoEstado as EstadoRuta }],
      });
      const ok = resp.procesados.some((p) => p.uuidOffline === e.uuidOffline);
      const errItem = resp.errores.find((p) => p.uuidOffline === e.uuidOffline);
      const now = new Date().toISOString();
      if (ok) {
        await doc.patch({ sincronizado: true, updatedAt: now });
      } else if (errItem) {
        await doc.patch({ sincronizado: true, updatedAt: now });
        this.toast.mostrar(`Cambio de ruta no aplicado: ${errItem.error}`, 'info');
      }
    }
  }

  private async flushParadas(): Promise<void> {
    const pendDocs = (await this.rxDb.eventosParada.find({ selector: { sincronizado: false } }).exec()).sort(
      (a, b) =>
        (a.toJSON() as EventoParadaDocType).createdAt.localeCompare((b.toJSON() as EventoParadaDocType).createdAt),
    );
    if (!pendDocs.length) return;

    const paradas: SincronizacionParadaItem[] = pendDocs.map((d) => {
      const e = d.toJSON() as EventoParadaDocType;
      const item: SincronizacionParadaItem = {
        rutaPedidoId: e.rutaPedidoId,
        uuidOffline: e.uuidOffline,
        nuevoEstado: e.nuevoEstado as EstadoEntrega,
      };
      if (e.nuevoEstado === 'FALLIDO' && e.motivoFallo) item.motivoFallo = e.motivoFallo;
      return item;
    });

    const resp = await this.api.sincronizarParadas({ paradas });
    const okUuids = new Set(resp.procesados.map((p) => p.uuidOffline));
    const errMap = new Map(resp.errores.map((p) => [p.uuidOffline, p.error]));
    const now = new Date().toISOString();
    let okCount = 0;
    for (const d of pendDocs) {
      const e = d.toJSON() as EventoParadaDocType;
      if (okUuids.has(e.uuidOffline)) {
        await d.patch({ sincronizado: true, updatedAt: now });
        okCount++;
      } else if (errMap.has(e.uuidOffline)) {
        await d.patch({ sincronizado: true, updatedAt: now });
        this.toast.mostrar(`Parada no sincronizada: ${errMap.get(e.uuidOffline)}`, 'info');
      }
    }
    if (okCount > 0) this.toast.exito(`${okCount} cambio(s) de reparto sincronizado(s).`);
  }
}
