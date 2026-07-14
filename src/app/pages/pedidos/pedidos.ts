import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs/operators';
import { EstadoPedido, ESTADO_LABELS, PedidoCompleto } from '../../models';
import { nombreGarrafa, TipoGarrafa } from '../../models/garrafa.model';
import { PedidoService } from '../../services/pedido.service';
import { AuthService } from '../../services/auth.service';
import { EstadoInfo } from '../../services/rx-database.service';
import { MapaVista } from '../../components/mapa-vista/mapa-vista';

@Component({
  selector: 'app-pedidos',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, MapaVista],
  templateUrl: './pedidos.html',
})
export class Pedidos {
  private pedidoSrv = inject(PedidoService);
  protected auth = inject(AuthService);

  private pedidosRaw = toSignal(
    this.pedidoSrv.getPedidos$().pipe(startWith(null)),
    { initialValue: null },
  );

  private pedidosTodos = computed<PedidoCompleto[]>(() => this.pedidosRaw() ?? []);
  protected cargando = computed(() => this.pedidosRaw() === null);

  protected pedidos = computed<PedidoCompleto[]>(() => {
    const todos = this.pedidosTodos();
    if (this.auth.esAdministrativo()) return todos;
    const uid = this.auth.userId();
    if (uid == null) return [];
    return todos.filter((p) => p.creadorId === uid);
  });

  protected estados: EstadoInfo[] = this.pedidoSrv.getEstados();
  protected filtroEstado = signal<string>('todos');
  protected busqueda = signal('');
  protected expandido = signal<string | null>(null);

  protected nombreGarrafa = nombreGarrafa;
  protected estadoLabels = ESTADO_LABELS;

  protected filtrados = computed(() => {
    const estado = this.filtroEstado();
    const q = this.busqueda().toLowerCase().trim();
    return this.pedidos().filter((p) => {
      if (estado !== 'todos' && p.estado !== estado) return false;
      if (!q) return true;
      const cliente = p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido} ${p.cliente.direccion}` : '';
      return `${p.uuidOffline} ${cliente} ${p.observaciones}`.toLowerCase().includes(q);
    });
  });

  protected alternar(uuid: string): void {
    this.expandido.set(this.expandido() === uuid ? null : uuid);
  }

  protected tieneUbicacion(p: PedidoCompleto): boolean {
    return p.cliente?.latitud != null && p.cliente?.longitud != null;
  }

  protected mapsUrl(p: PedidoCompleto): string {
    const lat = p.cliente?.latitud;
    const lng = p.cliente?.longitud;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  protected async cambiarEstado(pedido: PedidoCompleto, estado: EstadoPedido): Promise<void> {
    await this.pedidoSrv.cambiarEstado(pedido.uuidOffline, estado);
  }

  protected claseEstado(estado?: EstadoPedido): string {
    switch (estado) {
      case 'PENDIENTE': return 'bg-brand-100 text-brand-800 border-brand-300';
      case 'EN_PROCESO': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ENTREGADO': return 'bg-green-50 text-green-700 border-green-200';
      case 'CANCELADO': return 'bg-red-50 text-red-600 border-red-200';
      case 'REPROGRAMADO': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  }
}
