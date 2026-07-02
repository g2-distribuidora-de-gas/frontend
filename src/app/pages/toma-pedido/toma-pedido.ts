import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Cliente, Producto } from '../../models';
import { CatalogoService } from '../../services/catalogo.service';
import { PedidoService } from '../../services/pedido.service';

@Component({
  selector: 'app-toma-pedido',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './toma-pedido.html',
})
export class TomaPedido {
  private catalogo = inject(CatalogoService);
  private pedidoSrv = inject(PedidoService);
  private router = inject(Router);

  protected clientes = signal<Cliente[]>([]);
  protected productos = signal<Producto[]>([]);
  protected clienteId = signal<number | null>(null);
  protected busqueda = signal('');
  protected observaciones = signal('');
  protected cantidades = signal<Record<number, number>>({});
  protected guardando = signal(false);
  protected exito = signal<number | null>(null);

  protected clientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.clientes();
    return this.clientes().filter((c) =>
      `${c.nombre} ${c.apellido} ${c.direccion}`.toLowerCase().includes(q),
    );
  });

  protected clienteSeleccionado = computed(
    () => this.clientes().find((c) => c.id === this.clienteId()) ?? null,
  );

  protected items = computed(() => {
    const cant = this.cantidades();
    return this.productos()
      .filter((p) => (cant[p.id!] ?? 0) > 0)
      .map((p) => ({ producto: p, cantidad: cant[p.id!], subtotal: cant[p.id!] * p.precio_actual }));
  });

  protected total = computed(() => this.items().reduce((acc, i) => acc + i.subtotal, 0));
  protected puedeConfirmar = computed(() => !!this.clienteId() && this.items().length > 0 && !this.guardando());

  constructor() {
    this.catalogo.getClientesActivos().then((c) => this.clientes.set(c));
    this.catalogo.getProductosActivos().then((p) => this.productos.set(p));
  }

  protected cantidadDe(p: Producto): number {
    return this.cantidades()[p.id!] ?? 0;
  }

  protected ajustar(p: Producto, delta: number): void {
    this.cantidades.update((c) => {
      const nueva = Math.max(0, (c[p.id!] ?? 0) + delta);
      return { ...c, [p.id!]: nueva };
    });
  }

  protected setCantidad(p: Producto, valor: number | string | null): void {
  const n = Math.max(0, Math.floor(Number(valor) || 0));
  this.cantidades.update((c) => ({ ...c, [p.id!]: n }));
  }

  protected bloquearNoEnteros(e: KeyboardEvent): void {
  if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }

  protected seleccionarCliente(c: Cliente): void {
    this.clienteId.set(this.clienteId() === c.id ? null : c.id!);
  }

  protected async confirmar(): Promise<void> {
    if (!this.puedeConfirmar()) return;
    this.guardando.set(true);
    try {
      const id = await this.pedidoSrv.crearPedido(
        this.clienteId()!,
        this.items().map((i) => ({
          id_producto: i.producto.id!,
          cantidad: i.cantidad,
          precio_unitario: i.producto.precio_actual,
        })),
        this.observaciones().trim(),
      );
      this.exito.set(id);
      this.cantidades.set({});
      this.observaciones.set('');
      this.clienteId.set(null);
      this.busqueda.set('');
    } finally {
      this.guardando.set(false);
    }
  }

  protected verPedidos(): void {
    this.router.navigate(['/pedidos']);
  }
}
