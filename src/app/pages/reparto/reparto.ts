import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { RepartoOfflineService } from '../../services/reparto-offline.service';
import { ToastService } from '../../services/toast.service';
import { RealtimeService } from '../../services/realtime.service';
import { TrackingRepartidorService } from '../../services/tracking-repartidor.service';
import {EstadoEntrega, ESTADO_ENTREGA_LABELS, ESTADO_RUTA_LABELS, RutaPedidoOffline} from '../../models/ruta.model';
import { ESTADO_LABELS } from '../../models/pedido.model';
import { nombreGarrafa } from '../../models/garrafa.model';
import { MapaRuta } from '../../components/mapa-ruta/mapa-ruta';
import { MapaVista } from '../../components/mapa-vista/mapa-vista';

@Component({
  selector: 'app-reparto',
  imports: [DecimalPipe, FormsModule, MapaRuta, MapaVista],
  templateUrl: './reparto.html',
})
export class Reparto implements OnDestroy {
  private auth = inject(AuthService);
  private reparto = inject(RepartoOfflineService);
  private toast = inject(ToastService);
  private realtime = inject(RealtimeService);
  private tracking = inject(TrackingRepartidorService);

  protected ruta = this.reparto.ruta;
  protected pendientes = this.reparto.pendientes;
  protected sincronizando = this.reparto.sincronizando;

  protected cargando = signal(true);
  protected procesando = signal(false);
  protected seleccionadaId = signal<number | null>(null);
  protected paradaAFallar = signal<RutaPedidoOffline | null>(null);
  protected motivoFallo = signal('');

  protected gpsSoportado = typeof navigator !== 'undefined' && typeof navigator.geolocation?.watchPosition === 'function';
  protected gpsActivo = signal(false);
  protected stompConectado = signal(this.realtime.estaConectado());

  private subErrores?: Subscription;
  private subConexion?: Subscription;

  protected paradaModal = signal<RutaPedidoOffline | null>(null);

  protected readonly ESTADO_ENTREGA_LABELS = ESTADO_ENTREGA_LABELS;
  protected readonly ESTADO_RUTA_LABELS = ESTADO_RUTA_LABELS;
  protected readonly ESTADO_PEDIDO_LABELS = ESTADO_LABELS;
  protected readonly nombreGarrafa = nombreGarrafa;

  protected sinRuta = computed(() => !this.cargando() && this.ruta() == null);

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

  protected puedeTracking = computed(() => {
    const e = this.estadoRuta();
    return e === 'PLANIFICADA' || e === 'EN_CURSO';
  });

  protected paradaModalActual = computed(() => {
    const m = this.paradaModal();
    if (!m) return null;
    return this.paradas().find((p) => p.id === m.id) ?? m;
  });

  constructor() {
    void this.cargar();
    this.subConexion = this.realtime.conectado$.subscribe((v) =>
      this.stompConectado.set(v),
    );
    this.subErrores = this.realtime.errores$.subscribe((err) =>
      this.toast.error(`[${err.codigo}] ${err.mensaje}`),
    );
  }

  ngOnDestroy(): void {
    void this.detenerTracking();
    this.subErrores?.unsubscribe();
    this.subConexion?.unsubscribe();
  }

  protected async cargar(): Promise<void> {
    const uid = this.auth.userId();
    if (uid == null) {
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    try {
      await this.reparto.iniciar(uid);
      const primera = this.paradas()[0];
      if (primera && this.seleccionadaId() == null) this.seleccionadaId.set(primera.id);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async sincronizar(): Promise<void> {
    await this.reparto.sincronizarAhora();
  }

  protected seleccionar(p: RutaPedidoOffline): void {
    this.seleccionadaId.set(p.id);
  }

  protected abrirDetalle(p: RutaPedidoOffline): void {
    this.seleccionadaId.set(p.id);
    this.paradaModal.set(p);
  }

  protected cerrarDetalle(): void {
    this.paradaModal.set(null);
  }

  protected totalPedido(p: RutaPedidoOffline): number {
    if (p.totalPedido != null) return p.totalPedido;
    return (p.detalles ?? []).reduce((s, d) => s + (d.subtotal ?? 0), 0);
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
      await this.reparto.cambiarEstadoRuta(ruta.id, estado);
      this.toast.exito(mensajeOk);
      if ((estado === 'COMPLETADA' || estado === 'CANCELADA') && this.gpsActivo()) {
        await this.detenerTracking();
      }
    } catch {
      this.toast.error('No se pudo registrar el cambio de estado de la ruta.');
    } finally {
      this.procesando.set(false);
    }
  }


  protected async iniciarTracking(): Promise<void> {
    const ruta = this.ruta();
    if (!ruta || !this.gpsSoportado) return;
    const token = this.auth.token;
    if (!token) {
      this.toast.error('Sesión sin token. Volvé a iniciar sesión.');
      return;
    }
    if (!this.stompConectado()) {
      this.realtime.conectar(token);
    }

    const ok = this.tracking.iniciar(ruta.id);
    if (!ok) {
      this.toast.error(
        'No se pudo iniciar el tracking GPS. Revisá los permisos de ubicación.',
      );
      return;
    }
    this.gpsActivo.set(true);
    this.toast.exito('Tracking GPS iniciado. Tu posición se publica en vivo.');
  }

  protected async detenerTracking(): Promise<void> {
    await this.tracking.detener();
    this.gpsActivo.set(false);
  }

  // ─── Estado de las paradas ────────────────────────────────────────

  protected pedirMotivoFallo(p: RutaPedidoOffline): void {
    if (this.procesando()) return;
    if (!this.enCurso()) {
      this.toast.error('Iniciá el reparto antes de actualizar las paradas.');
      return;
    }
    this.motivoFallo.set('');
    this.paradaAFallar.set(p);
  }

  protected cancelarDialogoFallo(): void {
    this.paradaAFallar.set(null);
    this.motivoFallo.set('');
  }

  protected async confirmarFallo(): Promise<void> {
    const p = this.paradaAFallar();
    if (!p) return;
    const motivo = this.motivoFallo().trim();
    if (motivo === '') {
      this.toast.error('Indicá el motivo de la cancelación.');
      return;
    }
    await this.marcarParada(p, 'FALLIDO', motivo);
    this.cancelarDialogoFallo();
  }

  protected async marcarParada(
    p: RutaPedidoOffline,
    estado: EstadoEntrega,
    motivoFallo?: string,
  ): Promise<void> {
    if (this.procesando()) return;
    if (!this.enCurso()) {
      this.toast.error('Iniciá el reparto antes de actualizar las paradas.');
      return;
    }
    this.procesando.set(true);
    try {
      await this.reparto.marcarParada(p.id, estado, motivoFallo);
      this.toast.exito(`Parada #${p.orden} → ${ESTADO_ENTREGA_LABELS[estado]}.`);
    } catch {
      this.toast.error('No se pudo registrar el cambio de la parada.');
    } finally {
      this.procesando.set(false);
    }
  }

  // ─── Helpers de presentación ──────────────────────────────────────

  protected claseEntrega(estado: EstadoEntrega): string {
    switch (estado) {
      case 'ENTREGADO':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'FALLIDO':
        return 'bg-red-50 text-red-600 border-red-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  protected km(m?: number | null): number {
    return m != null ? m / 1000 : 0;
  }

  protected minutos(s?: number | null): number {
    return s != null ? Math.round(s / 60) : 0;
  }

  protected mapsUrl(p: RutaPedidoOffline): string {
    return `https://www.google.com/maps/search/?api=1&query=${p.cliente?.latitud},${p.cliente?.longitud}`;
  }
}
