import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ApiPedidoService } from '../../../services/api-pedido.service';
import { ApiRutaService } from '../../../services/api-ruta.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { RealtimeService } from '../../../services/realtime.service';
import { UsuarioResponse } from '../../../models/usuario.model';
import { PedidoResponse } from '../../../models/pedido.model';
import {
  RutaResponse,
  RutaPedidoResponse,
  ESTADO_RUTA_LABELS,
  ESTADO_ENTREGA_LABELS,
} from '../../../models/ruta.model';
import { MapaRuta } from '../../../components/mapa-ruta/mapa-ruta';
import { MapaRutaLive } from '../../../components/mapa-ruta-live/mapa-ruta-live';

@Component({
  selector: 'app-admin-rutas',
  imports: [FormsModule, DecimalPipe, MapaRuta, MapaRutaLive],
  templateUrl: './rutas.html',
})
export class RutasAdmin implements OnDestroy {
  private apiUsuario = inject(ApiUsuarioService);
  private apiPedido = inject(ApiPedidoService);
  private apiRuta = inject(ApiRutaService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);

  protected stompConectado = signal(this.realtime.estaConectado());
  private subConexion?: Subscription;
  private subErrores?: Subscription;
  protected rutaLiveHabilitada = computed(() => {
    const e = this.rutaCreada()?.estado;
    return e === 'PLANIFICADA' || e === 'EN_CURSO';
  });

  protected repartidores = signal<UsuarioResponse[]>([]);
  protected usuarios = signal<UsuarioResponse[]>([]);
  protected pedidos = signal<PedidoResponse[]>([]);
  protected todasRutas = signal<RutaResponse[]>([]);
  protected rutaExpandidaId = signal<number | null>(null);
  protected cargando = signal(true);
  protected planificando = signal(false);

  protected readonly ESTADO_RUTA_LABELS = ESTADO_RUTA_LABELS;
  protected readonly ESTADO_ENTREGA_LABELS = ESTADO_ENTREGA_LABELS;

  protected repartidorId = signal<number | null>(null);
  protected hoy = signal<string>(new Date().toISOString().slice(0, 10));
  protected fechaReparto = signal<string>(this.hoy());
  protected seleccionados = signal<Set<number>>(new Set());
  protected busqueda = signal('');
  protected rutaCreada = signal<RutaResponse | null>(null);
  protected pendientes = computed(() =>
    this.pedidos().filter((p) => p.estado === 'PENDIENTE' || p.estado === 'REPROGRAMADO'),
  );

  protected pendientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.pendientes();
    return this.pendientes().filter((p) =>
      `${p.clienteNombre} ${p.direccionEntrega} ${p.id}`.toLowerCase().includes(q),
    );
  });

  protected cantidadSeleccionada = computed(() => this.seleccionados().size);

  protected puedePlanificar = computed(
    () => this.repartidorId() != null && this.cantidadSeleccionada() > 0 && !this.planificando(),
  );

  constructor() {
    void this.cargar();
    const token = this.auth.token;
    if (token) {
      if (!this.realtime.estaConectado()) {
        this.realtime.conectar(token);
      }
    }
    this.subConexion = this.realtime.conectado$.subscribe((v) =>
      this.stompConectado.set(v),
    );
    this.subErrores = this.realtime.errores$.subscribe((err) =>
      this.toast.error(`[${err.codigo}] ${err.mensaje}`),
    );
  }

  ngOnDestroy(): void {
    this.subConexion?.unsubscribe();
    this.subErrores?.unsubscribe();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [usuarios, pedidos, rutas] = await Promise.all([
        this.apiUsuario.listarTodos(),
        this.apiPedido.listarTodos(),
        this.apiRuta.listarTodas().catch(() => [] as RutaResponse[]),
      ]);
      this.usuarios.set(usuarios);
      this.repartidores.set(usuarios.filter((u) => u.rol === 'REPARTIDOR' && u.activo));
      this.pedidos.set(pedidos);
      this.todasRutas.set(this.ordenarRutas(rutas));
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudieron cargar los datos.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private ordenarRutas(rutas: RutaResponse[]): RutaResponse[] {
    return [...rutas].sort((a, b) => b.id - a.id);
  }

  protected toggleRuta(id: number): void {
    this.rutaExpandidaId.set(this.rutaExpandidaId() === id ? null : id);
  }

  protected nombreRepartidorDe(id: number): string {
    const u = this.usuarios().find((x) => x.id === id);
    return u ? u.nombreCompleto : `#${id}`;
  }

  protected entregadasDe(r: RutaResponse): number {
    return r.paradas.filter((p) => p.estadoEntrega === 'ENTREGADO').length;
  }

  protected claseEstadoRuta(estado: RutaResponse['estado']): string {
    switch (estado) {
      case 'EN_CURSO':
        return 'border-blue-300 bg-blue-50 text-blue-700';
      case 'COMPLETADA':
        return 'border-green-300 bg-green-50 text-green-700';
      case 'CANCELADA':
        return 'border-red-200 bg-red-50 text-red-600';
      case 'REPROGRAMADA':
        return 'border-amber-300 bg-amber-50 text-amber-700';
      default:
        return 'border-brand-300 bg-brand-100 text-brand-800';
    }
  }

  protected claseEntrega(estado: RutaPedidoResponse['estadoEntrega']): string {
    switch (estado) {
      case 'ENTREGADO':
        return 'border-green-300 bg-green-50 text-green-700';
      case 'FALLIDO':
        return 'border-red-200 bg-red-50 text-red-600';
      default:
        return 'border-brand-200 bg-brand-50 text-brand-700';
    }
  }

  protected estaSeleccionado(id: number): boolean {
    return this.seleccionados().has(id);
  }

  protected alternar(id: number): void {
    this.seleccionados.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  protected seleccionarTodos(): void {
    this.seleccionados.set(new Set(this.pendientesFiltrados().map((p) => p.id)));
  }

  protected limpiarSeleccion(): void {
    this.seleccionados.set(new Set());
  }

  protected async planificar(): Promise<void> {
    if (!this.puedePlanificar()) return;
    const repartidorId = this.repartidorId();
    if (repartidorId == null) return;

    this.planificando.set(true);
    this.rutaCreada.set(null);
    try {
      const ruta = await this.apiRuta.planificar({
        repartidorId,
        pedidosIds: [...this.seleccionados()],
        fechaReparto: this.fechaReparto(),
      });
      this.rutaCreada.set(ruta);
      this.toast.exito('Ruta planificada correctamente con LocationIQ.');
      this.limpiarSeleccion();
      await this.cargar();
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo planificar la ruta.'));
    } finally {
      this.planificando.set(false);
    }
  }

  protected nombreRepartidor(id: number | null): string {
    const r = this.repartidores().find((x) => x.id === id);
    return r ? r.nombreCompleto : '';
  }

  protected km(m?: number | null): number {
    return m != null ? m / 1000 : 0;
  }

  protected minutos(s?: number | null): number {
    return s != null ? Math.round(s / 60) : 0;
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
