import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { ApiRutaService } from '../../services/api-ruta.service';
import { ApiPedidoService } from '../../services/api-pedido.service';
import { ToastService } from '../../services/toast.service';
import {EstadoEntrega, ESTADO_ENTREGA_LABELS, ESTADO_RUTA_LABELS, RutaPedidoResponse,RutaResponse} from '../../models/ruta.model';
import { EstadoPedido } from '../../models/pedido.model';
import { MapaRuta } from '../../components/mapa-ruta/mapa-ruta';

@Component({
  selector: 'app-reparto',
  imports: [DecimalPipe, MapaRuta],
  templateUrl: './reparto.html',
})
export class Reparto {
  private auth = inject(AuthService);
  private apiRuta = inject(ApiRutaService);
  private apiPedido = inject(ApiPedidoService);
  private toast = inject(ToastService);

  protected ruta = signal<RutaResponse | null>(null);
  protected cargando = signal(true);
  protected sinRuta = signal(false);
  protected procesando = signal(false);
  protected seleccionadaId = signal<number | null>(null);

  protected readonly ESTADO_ENTREGA_LABELS = ESTADO_ENTREGA_LABELS;
  protected readonly ESTADO_RUTA_LABELS = ESTADO_RUTA_LABELS;

  protected paradas = computed(() =>
    [...(this.ruta()?.paradas ?? [])].sort((a, b) => a.orden - b.orden),
  );

  protected totalParadas = computed(() => this.paradas().length);
  protected entregadas = computed(
    () => this.paradas().filter((p) => p.estadoEntrega === 'ENTREGADO').length,
  );
  protected resueltas = computed(
    () => this.paradas().filter((p) => p.estadoEntrega !== 'PENDIENTE').length,
  );
  protected progreso = computed(() => {
    const t = this.totalParadas();
    return t === 0 ? 0 : Math.round((this.resueltas() / t) * 100);
  });

  protected estadoRuta = computed(() => this.ruta()?.estado ?? null);
  protected puedeIniciar = computed(() => this.estadoRuta() === 'PLANIFICADA');
  protected puedeFinalizar = computed(() => this.estadoRuta() === 'EN_CURSO');
  protected enCurso = computed(() => this.estadoRuta() === 'EN_CURSO');

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    const uid = this.auth.userId();
    if (uid == null) {
      this.sinRuta.set(true);
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    this.sinRuta.set(false);
    try {
      const ruta = await this.apiRuta.obtenerMiRutaActiva(uid);
      this.ruta.set(ruta);
      const primera = [...ruta.paradas].sort((a, b) => a.orden - b.orden)[0];
      this.seleccionadaId.set(primera ? primera.id : null);
    } catch (e) {
      if (e instanceof HttpErrorResponse && (e.status === 404 || e.status === 400)) {
        this.ruta.set(null);
        this.sinRuta.set(true);
      } else {
        this.toast.error(this.msgError(e, 'No se pudo cargar tu ruta.'));
        this.sinRuta.set(true);
      }
    } finally {
      this.cargando.set(false);
    }
  }

  protected seleccionar(p: RutaPedidoResponse): void {
    this.seleccionadaId.set(p.id);
  }


  protected async iniciarRuta(): Promise<void> {
    await this.cambiarEstadoRuta('EN_CURSO', 'Reparto iniciado.');
  }

  protected async finalizarRuta(): Promise<void> {
    if (this.resueltas() < this.totalParadas()) {
      if (!confirm('Todavía hay paradas pendientes. ¿Finalizar la ruta igualmente?')) return;
    }
    await this.cambiarEstadoRuta('COMPLETADA', 'Ruta completada.');
  }

  protected async cancelarRuta(): Promise<void> {
    if (!confirm('¿Cancelar la ruta? Esta acción no se puede deshacer.')) return;
    await this.cambiarEstadoRuta('CANCELADA', 'Ruta cancelada.');
  }

  private async cambiarEstadoRuta(
    estado: 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA',
    mensajeOk: string,
  ): Promise<void> {
    const ruta = this.ruta();
    if (!ruta || this.procesando()) return;
    this.procesando.set(true);
    try {
      const actualizada = await this.apiRuta.cambiarEstadoRuta(ruta.id, estado);
      this.toast.exito(mensajeOk);
      if (estado === 'EN_CURSO') {
        this.ruta.set(actualizada);
      } else {
        this.ruta.set(null);
        this.sinRuta.set(true);
      }
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo cambiar el estado de la ruta.'));
    } finally {
      this.procesando.set(false);
    }
  }

  private estadoPedidoDe(estado: EstadoEntrega): EstadoPedido {
    switch (estado) {
      case 'ENTREGADO': return 'ENTREGADO';
      case 'FALLIDO': return 'CANCELADO';
      default: return 'PENDIENTE';
    }
  }

  protected async marcarParada(p: RutaPedidoResponse, estado: EstadoEntrega): Promise<void> {
    if (this.procesando()) return;
    if (!this.enCurso()) {
      this.toast.error('Iniciá el reparto antes de actualizar las paradas.');
      return;
    }
    this.procesando.set(true);
    try {
      await this.apiRuta.actualizarEstadoParada(p.id, estado);
      try {
        await this.apiPedido.cambiarEstado(p.pedidoId, this.estadoPedidoDe(estado));
      } catch {
        this.toast.mostrar('Parada actualizada; el estado del pedido se sincronizará luego.', 'info');
      }
      this.actualizarParadaLocal(p.id, estado);
      this.toast.exito(`Parada #${p.orden} → ${ESTADO_ENTREGA_LABELS[estado]}.`);
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo actualizar la parada.'));
    } finally {
      this.procesando.set(false);
    }
  }

  protected async marcarEnProceso(p: RutaPedidoResponse): Promise<void> {
    if (this.procesando()) return;
    if (!this.enCurso()) {
      this.toast.error('Iniciá el reparto antes de actualizar los pedidos.');
      return;
    }
    this.procesando.set(true);
    try {
      await this.apiPedido.cambiarEstado(p.pedidoId, 'EN_PROCESO');
      this.toast.exito(`Pedido #${p.pedidoId} en proceso.`);
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo actualizar el pedido.'));
    } finally {
      this.procesando.set(false);
    }
  }

  private actualizarParadaLocal(rutaPedidoId: number, estado: EstadoEntrega): void {
    this.ruta.update((r) => {
      if (!r) return r;
      return {
        ...r,
        paradas: r.paradas.map((p) =>
          p.id === rutaPedidoId ? { ...p, estadoEntrega: estado } : p,
        ),
      };
    });
  }

  protected claseEntrega(estado: EstadoEntrega): string {
    switch (estado) {
      case 'ENTREGADO': return 'bg-green-50 text-green-700 border-green-200';
      case 'FALLIDO': return 'bg-red-50 text-red-600 border-red-200';
      default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  protected km(m?: number | null): number {
    return m != null ? m / 1000 : 0;
  }

  protected minutos(s?: number | null): number {
    return s != null ? Math.round(s / 60) : 0;
  }

  protected mapsUrl(p: RutaPedidoResponse): string {
    return `https://www.google.com/maps/search/?api=1&query=${p.cliente?.latitud},${p.cliente?.longitud}`;
  }

  private msgError(e: unknown, fallback: string): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.mensaje;
      if (typeof msg === 'string') return msg;
      if (e.status === 0) return 'No se pudo conectar con el servidor.';
    }
    if (e instanceof Error && e.message) return e.message;
    return fallback;
  }
}
