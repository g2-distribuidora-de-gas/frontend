import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { RepartoOfflineService } from '../../services/reparto-offline.service';
import { ToastService } from '../../services/toast.service';
import { ApiRutaService } from '../../services/api-ruta.service';
import { AgendaWsService } from '../../services/agenda-ws.service';
import {
  AgendaRepartidorResponse,
  ConfirmacionRepartidor,
  ConfirmarTurnoRequest,
  CONFIRMACION_LABELS,
  EstadoEntrega,
  ESTADO_ENTREGA_LABELS,
  ESTADO_RUTA_LABELS,
  RutaPedidoOffline,
} from '../../models/ruta.model';
import { ESTADO_LABELS } from '../../models/pedido.model';
import { nombreGarrafa } from '../../models/garrafa.model';
import { MapaRuta } from '../../components/mapa-ruta/mapa-ruta';
import { MapaVista } from '../../components/mapa-vista/mapa-vista';

type Pestana = 'hoy' | 'agenda';

@Component({
  selector: 'app-reparto',
  imports: [DecimalPipe, DatePipe, FormsModule, MapaRuta, MapaVista],
  templateUrl: './reparto.html',
})
export class Reparto {
  private auth = inject(AuthService);
  private reparto = inject(RepartoOfflineService);
  private toast = inject(ToastService);
  private apiRuta = inject(ApiRutaService);
  private agendaWs = inject(AgendaWsService);

  protected ruta = this.reparto.ruta;
  protected pendientes = this.reparto.pendientes;
  protected sincronizando = this.reparto.sincronizando;

  // ── Ruta activa ────────────────────────────────────────────────────
  protected cargando = signal(true);
  protected procesando = signal(false);
  protected seleccionadaId = signal<number | null>(null);
  protected paradaAFallar = signal<RutaPedidoOffline | null>(null);
  protected motivoFallo = signal('');
  protected paradaModal = signal<RutaPedidoOffline | null>(null);

  protected readonly ESTADO_ENTREGA_LABELS = ESTADO_ENTREGA_LABELS;
  protected readonly ESTADO_RUTA_LABELS = ESTADO_RUTA_LABELS;
  protected readonly ESTADO_PEDIDO_LABELS = ESTADO_LABELS;
  protected readonly CONFIRMACION_LABELS = CONFIRMACION_LABELS;
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

  protected paradaModalActual = computed(() => {
    const m = this.paradaModal();
    if (!m) return null;
    return this.paradas().find((p) => p.id === m.id) ?? m;
  });

  // ── Agenda ─────────────────────────────────────────────────────────
  protected pestanaActiva = signal<Pestana>('hoy');
  protected agenda = signal<AgendaRepartidorResponse[]>([]);
  protected cargandoAgenda = signal(false);
  protected rutaAConfirmar = signal<AgendaRepartidorResponse | null>(null);
  protected motivoRechazo = signal('');

  protected pendientesConfirmacion = computed(
    () => this.agenda().filter((r) => r.confirmacionRepartidor === 'PENDIENTE').length,
  );

  constructor() {
    void this.cargar();
    void this.cargarAgenda();

    // Conectar WS de agenda cuando el token esté disponible
    effect(() => {
      const token = this.auth.token;
      if (token) this.agendaWs.conectar(token);
    });

    // Reaccionar a notificaciones WebSocket recibidas
    effect(() => {
      const notifs = this.agendaWs.notificaciones();
      if (notifs.length > 0) {
        const ultima = notifs[0];
        this.toast.mostrar(ultima.mensaje, 'info');
        void this.cargarAgenda();
      }
    });
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────

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

  // ── Métodos de paradas ─────────────────────────────────────────────

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
    } catch {
      this.toast.error('No se pudo registrar el cambio de estado de la ruta.');
    } finally {
      this.procesando.set(false);
    }
  }

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

  // ── Agenda ─────────────────────────────────────────────────────────

  protected async cargarAgenda(): Promise<void> {
    const uid = this.auth.userId();
    if (uid == null) return;
    this.cargandoAgenda.set(true);
    try {
      const hoy = this.isoHoy();
      const en30 = this.isoEn(30);
      this.agenda.set(await this.apiRuta.obtenerAgenda(uid, hoy, en30));
    } catch {
      // Error silencioso — la agenda no bloquea el reparto
    } finally {
      this.cargandoAgenda.set(false);
    }
  }

  protected abrirDialogoRechazo(ruta: AgendaRepartidorResponse): void {
    this.motivoRechazo.set('');
    this.rutaAConfirmar.set(ruta);
  }

  protected cancelarDialogoRechazo(): void {
    this.rutaAConfirmar.set(null);
    this.motivoRechazo.set('');
  }

  protected async confirmarTurno(
    ruta: AgendaRepartidorResponse,
    confirmacion: ConfirmacionRepartidor,
  ): Promise<void> {
    const body: ConfirmarTurnoRequest = { confirmacion };
    if (confirmacion === 'RECHAZADO') {
      const motivo = this.motivoRechazo().trim();
      if (!motivo) {
        this.toast.error('Indicá el motivo del rechazo.');
        return;
      }
      body.motivoRechazo = motivo;
    }
    this.procesando.set(true);
    try {
      const actualizado = await this.apiRuta.confirmarTurno(ruta.rutaId, body);
      this.agenda.update((prev) =>
        prev.map((r) => (r.rutaId === actualizado.rutaId ? actualizado : r)),
      );
      this.toast.exito(
        confirmacion === 'CONFIRMADO' ? '✓ Turno confirmado.' : 'Turno rechazado.',
      );
      this.rutaAConfirmar.set(null);
    } catch {
      this.toast.error('No se pudo registrar la respuesta. Intentá de nuevo.');
    } finally {
      this.procesando.set(false);
    }
  }

  // ── Helpers de presentación ────────────────────────────────────────

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

  protected claseConfirmacion(c: ConfirmacionRepartidor): string {
    switch (c) {
      case 'CONFIRMADO':
        return 'bg-green-100 text-green-700 ring-1 ring-green-300';
      case 'RECHAZADO':
        return 'bg-red-100 text-red-600 ring-1 ring-red-300';
      default:
        return 'bg-amber-100 text-amber-700 ring-1 ring-amber-300';
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

  private isoHoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isoEn(dias: number): string {
    return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  }
}
