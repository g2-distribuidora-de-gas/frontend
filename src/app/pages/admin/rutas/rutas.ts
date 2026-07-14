import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ApiPedidoService } from '../../../services/api-pedido.service';
import { ApiRutaService } from '../../../services/api-ruta.service';
import { ToastService } from '../../../services/toast.service';
import { UsuarioResponse } from '../../../models/usuario.model';
import { PedidoResponse } from '../../../models/pedido.model';
import { RutaResponse } from '../../../models/ruta.model';
import { MapaRuta } from '../../../components/mapa-ruta/mapa-ruta';

@Component({
  selector: 'app-admin-rutas',
  imports: [FormsModule, DecimalPipe, MapaRuta],
  templateUrl: './rutas.html',
})
export class RutasAdmin {
  private apiUsuario = inject(ApiUsuarioService);
  private apiPedido = inject(ApiPedidoService);
  private apiRuta = inject(ApiRutaService);
  private toast = inject(ToastService);

  protected repartidores = signal<UsuarioResponse[]>([]);
  protected pedidos = signal<PedidoResponse[]>([]);
  protected cargando = signal(true);
  protected planificando = signal(false);

  protected repartidorId = signal<number | null>(null);
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
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [usuarios, pedidos] = await Promise.all([
        this.apiUsuario.listarTodos(),
        this.apiPedido.listarTodos(),
      ]);
      this.repartidores.set(usuarios.filter((u) => u.rol === 'REPARTIDOR' && u.activo));
      this.pedidos.set(pedidos);
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudieron cargar los datos.'));
    } finally {
      this.cargando.set(false);
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
