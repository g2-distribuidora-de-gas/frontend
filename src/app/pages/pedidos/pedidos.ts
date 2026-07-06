import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { EstadoPedido, ESTADO_LABELS, PedidoCompleto } from '../../models';
import { nombreGarrafa, TipoGarrafa } from '../../models/garrafa.model';
import { PedidoService } from '../../services/pedido.service';
import { EstadoInfo } from '../../services/rx-database.service';

@Component({
  selector: 'app-pedidos',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './pedidos.html',
})
export class Pedidos {
  private pedidoSrv = inject(PedidoService);

  protected pedidos = signal<PedidoCompleto[]>([]);
  protected estados: EstadoInfo[] = this.pedidoSrv.getEstados();
  protected filtroEstado = signal<string>('todos');
  protected busqueda = signal('');
  protected expandido = signal<string | null>(null);
  protected cargando = signal(true);

  protected nombreGarrafa = nombreGarrafa;
  protected estadoLabels = ESTADO_LABELS;

  protected filtrados = computed(() => {
    const estado = this.filtroEstado();
    const q = this.busqueda().toLowerCase().trim();
    return this.pedidos().filter((p) => {
      if (estado !== 'todos' && p.estado !== estado) return false;
      if (!q) return true;
      const usuario = p.usuario ? `${p.usuario.nombre} ${p.usuario.apellido} ${p.usuario.direccion}` : '';
      return `${p.uuidOffline} ${usuario} ${p.observaciones}`.toLowerCase().includes(q);
    });
  });

  constructor() {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.pedidos.set(await this.pedidoSrv.getPedidos());
    this.cargando.set(false);
  }

  protected alternar(uuid: string): void {
    this.expandido.set(this.expandido() === uuid ? null : uuid);
  }

  protected async cambiarEstado(pedido: PedidoCompleto, estado: EstadoPedido): Promise<void> {
    await this.pedidoSrv.cambiarEstado(pedido.uuidOffline, estado);
    await this.cargar();
  }

  protected claseEstado(estado?: EstadoPedido): string {
    switch (estado) {
      case 'PENDIENTE': return 'bg-brand-100 text-brand-800 border-brand-300';
      case 'EN_PROCESO': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ENTREGADO': return 'bg-green-50 text-green-700 border-green-200';
      case 'CANCELADO': return 'bg-red-50 text-red-600 border-red-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  }
}
