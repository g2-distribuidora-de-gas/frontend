
import { Component, computed, effect, inject, signal, OnDestroy, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { RepartoOfflineService } from '../../services/reparto-offline.service';
import { ToastService } from '../../services/toast.service';
import { ApiRutaService } from '../../services/api-ruta.service';
import { AgendaWsService } from '../../services/agenda-ws.service';
import { RxDatabaseService } from '../../services/rx-database.service';
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


import { Subscription } from 'rxjs';

import { RealtimeService } from '../../services/realtime.service';
import { TrackingRepartidorService } from '../../services/tracking-repartidor.service';


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
export class Reparto implements OnDestroy {
  private auth = inject(AuthService);
  private reparto = inject(RepartoOfflineService);
  private toast = inject(ToastService);
  private apiRuta = inject(ApiRutaService);
  private agendaWs = inject(AgendaWsService);
  private realtime = inject(RealtimeService);
  private tracking = inject(TrackingRepartidorService);
  private zone = inject(NgZone);
  private dbService = inject(RxDatabaseService);

  protected ruta = this.reparto.ruta;
  protected pendientes = this.reparto.pendientes;
  protected sincronizando = this.reparto.sincronizando;

  // ── Ruta activa ────────────────────────────────────────────────────
  protected cargando = signal(true);
  protected procesando = signal(false);
  protected seleccionadaId = signal<number | null>(null);
  protected paradaAFallar = signal<RutaPedidoOffline | null>(null);
  protected motivoFallo = signal('');


  protected gpsSoportado = typeof navigator !== 'undefined' && typeof navigator.geolocation?.watchPosition === 'function';
  protected gpsSecureContext =
    typeof window === 'undefined' || window.isSecureContext === true;
  protected gpsActivo = signal(false);
  protected gpsPermiso = signal<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  protected gpsAviso = signal<string | null>(null);
  protected stompConectado = signal(this.realtime.estaConectado());

  private subErrores?: Subscription;
  private subConexion?: Subscription;

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

  protected puedeTracking = computed(() => {
    const e = this.estadoRuta();
    return e === 'PLANIFICADA' || e === 'EN_CURSO';
  });

  protected paradaModalActual = computed(() => {
    const m = this.paradaModal();
    if (!m) return null;
    return this.paradas().find((p) => p.id === m.id) ?? m;
  });

  // ── Agenda ─────────────────────────────────────────────────────────
  protected pestanaActiva = signal<Pestana>('hoy');
  protected agenda = signal<AgendaRepartidorResponse[]>([]);
  protected cargandoAgenda = signal(false);
  protected agendaOffline = signal(false);
  protected rutaAConfirmar = signal<AgendaRepartidorResponse | null>(null);
  protected motivoRechazo = signal('');

  protected agendaPendiente = computed(() =>
    this.agenda().filter((r) => r.confirmacionRepartidor === 'PENDIENTE')
  );
  
  protected agendaConfirmada = computed(() =>
    this.agenda().filter((r) => r.confirmacionRepartidor !== 'PENDIENTE')
  );

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

    void this.chequearPermisoGeo();
    this.subConexion = this.realtime.conectado$.subscribe((v) =>
      this.stompConectado.set(v),
    );
    this.subErrores = this.realtime.errores$.subscribe((err) =>
      this.toast.error(`[${err.codigo}] ${err.mensaje}`),
    );
  }

  private async chequearPermisoGeo(): Promise<void> {
    const estado = await this.tracking.consultarPermiso();
    this.gpsPermiso.set(estado);
    if (estado === 'denied') {
      this.gpsAviso.set(
        'El permiso de ubicación está bloqueado en este navegador. Habilitalo desde el candado de la barra de direcciones para poder transmitir tu posición.',
      );
    } else if (!this.gpsSecureContext) {
      this.gpsAviso.set(
        'La geolocalización solo funciona en HTTPS o en http://localhost:4200/. Abrí la app desde esa URL.',
      );
    }
  }

  protected async reintentarPermisoGeo(): Promise<void> {
    if (this.gpsPermiso() !== 'denied') {
      this.toast.info('Hacé click en "Iniciar tracking GPS" para volver a pedir el permiso.');
      return;
    }
    this.gpsAviso.set(
      'Andá al candado de la barra de direcciones del navegador, elegí "Permitir ubicación" para este sitio y volvé a hacer click en "Iniciar tracking GPS".',
    );
    this.toast.info('Cuando lo habilites, volvé a tocar el botón de tracking.');
  }

  ngOnDestroy(): void {
    void this.detenerTracking();
    this.subErrores?.unsubscribe();
    this.subConexion?.unsubscribe();
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
    if (!ruta || !this.gpsSoportado) {
      this.gpsAviso.set(
        this.gpsSoportado
          ? 'Aún no tenés una ruta activa asignada. Pedile al administrador que te cree una.'
          : 'Tu navegador no expone la API de geolocalización.',
      );
      return;
    }
    const token = this.auth.token;
    if (!token) {
      this.toast.error('Sesión sin token. Volvé a iniciar sesión.');
      return;
    }
    if (!this.stompConectado()) {
      this.realtime.conectar(token);
    }
    this.gpsAviso.set(
      'El navegador te va a preguntar si permitís acceder a tu ubicación. Aceptá para empezar.',
    );

    const resultado = await this.tracking.iniciar(ruta.id);
    if (resultado.estado === 'ok') {
      this.gpsPermiso.set(resultado.permiso ?? 'granted');
      this.gpsAviso.set(null);
      this.gpsActivo.set(true);
      this.toast.exito(resultado.mensaje);
      return;
    }

    if (resultado.permiso) this.gpsPermiso.set(resultado.permiso);

    if (
      resultado.estado === 'permiso-denegado' ||
      resultado.estado === 'sin-permisos-navegador'
    ) {
      this.gpsAviso.set(resultado.mensaje);
    } else if (
      resultado.estado === 'no-secure-context' ||
      resultado.estado === 'no-soportado'
    ) {
      this.gpsAviso.set(resultado.mensaje);
    } else if (
      resultado.estado === 'posicion-no-disponible' ||
      resultado.estado === 'timeout'
    ) {
      this.gpsAviso.set(resultado.mensaje);
    } else {
      this.toast.error(resultado.mensaje);
    }
  }

  protected async detenerTracking(): Promise<void> {
    await this.tracking.detener();
    this.gpsActivo.set(false);
    this.toast.info('Tracking GPS detenido.');
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

  // ── Agenda ─────────────────────────────────────────────────────────

  protected async cargarAgenda(): Promise<void> {
    const uid = this.auth.userId();
    if (uid == null) return;
    this.cargandoAgenda.set(true);

    try {
      if (this.dbService.db) {
        const docs = await this.dbService.db.agenda.find().exec();
        const offlineData = docs.map(d => ({ ...d.toJSON(), rutaId: Number(d.rutaId) }));
        // Ordenar por fecha ASC y luego rutaId DESC (los IDs más nuevos son probablemente más urgentes si tienen misma fecha)
        offlineData.sort((a, b) => a.fechaReparto.localeCompare(b.fechaReparto) || b.rutaId - a.rutaId);
        this.zone.run(() => this.agenda.set(offlineData as AgendaRepartidorResponse[]));
      }
    } catch {}

    try {
      const hoy = this.isoHoy();
      const en30 = this.isoEn(30);
      const data = await this.apiRuta.obtenerAgenda(uid, hoy, en30);
      
      this.zone.run(() => {
        data.sort((a, b) => a.fechaReparto.localeCompare(b.fechaReparto) || b.rutaId - a.rutaId);
        this.agenda.set(data);
        this.agendaOffline.set(false);
      });

      try {
        if (this.dbService.db) {
          const agendaIds = data.map(r => r.rutaId.toString());
          // Fetch existing to remove manually if $nin throws (Dexie sometimes struggles with $nin without index)
          const allDocs = await this.dbService.db.agenda.find().exec();
          for (const doc of allDocs) {
            if (!agendaIds.includes(doc.rutaId)) {
              await doc.remove();
            }
          }
          for (const r of data) {
            await this.dbService.db.agenda.upsert({ ...r, rutaId: r.rutaId.toString() });
          }
        }
      } catch (dbErr) {
        console.warn('Error sincronizando agenda en RxDB:', dbErr);
      }

    } catch {
      this.zone.run(() => this.agendaOffline.set(true));
    } finally {
      this.zone.run(() => this.cargandoAgenda.set(false));
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
      this.zone.run(() => {
        this.agenda.update((prev) =>
          prev.map((r) => (r.rutaId === actualizado.rutaId ? actualizado : r)),
        );
        this.toast.exito(
          confirmacion === 'CONFIRMADO' ? '✓ Turno confirmado.' : 'Turno rechazado.',
        );
        this.rutaAConfirmar.set(null);
      });
      if (this.dbService.db) {
        await this.dbService.db.agenda.upsert({ ...actualizado, rutaId: actualizado.rutaId.toString() });
      }
    } catch {
      this.zone.run(() => this.toast.error('No se pudo registrar la respuesta. Intentá de nuevo.'));
    } finally {
      this.zone.run(() => this.procesando.set(false));
    }
  }

  protected irAlReparto(): void {
    this.pestanaActiva.set('hoy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
