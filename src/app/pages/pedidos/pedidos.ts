import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { EstadoPedido, PedidoCompleto } from '../../models';
import { PedidoService } from '../../services/pedido.service';

@Component({
  selector: 'app-pedidos',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './pedidos.html',
})
export class Pedidos {
  private pedidoSrv = inject(PedidoService);

  protected pedidos = signal<PedidoCompleto[]>([]);
  protected estados = signal<EstadoPedido[]>([]);
  protected filtroEstado = signal<string>('todos');
  protected busqueda = signal('');
  protected expandido = signal<number | null>(null);
  protected cargando = signal(true);

  protected filtrados = computed(() => {
    const estado = this.filtroEstado();
    const q = this.busqueda().toLowerCase().trim();
    return this.pedidos().filter((p) => {
      if (estado !== 'todos' && p.estado_id !== estado) return false;
      if (!q) return true;
      const cliente = p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido} ${p.cliente.direccion}` : '';
      return `#${p.id} ${cliente} ${p.observaciones}`.toLowerCase().includes(q);
    });
  });

  constructor() {
    this.pedidoSrv.getEstados().then((e) => this.estados.set(e));
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.pedidos.set(await this.pedidoSrv.getPedidos());
    this.cargando.set(false);
  }

  protected alternar(id: number): void {
    this.expandido.set(this.expandido() === id ? null : id);
  }

  protected async cambiarEstado(pedido: PedidoCompleto, estadoId: string): Promise<void> {
    await this.pedidoSrv.cambiarEstado(pedido.id!, estadoId);
    await this.cargar();
  }

  protected claseEstado(nombre?: string): string {
    switch (nombre) {
      case 'Pendiente': return 'bg-brand-100 text-brand-800 border-brand-300';
      case 'En camino': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Entregado': return 'bg-green-50 text-green-700 border-green-200';
      case 'Cancelado': return 'bg-red-50 text-red-600 border-red-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  }
}
