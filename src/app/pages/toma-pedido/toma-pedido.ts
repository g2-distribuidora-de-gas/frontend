import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Cliente, Producto } from '../../models';
import { CatalogoService } from '../../services/catalogo.service';
import { PedidoService } from '../../services/pedido.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toma-pedido',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './toma-pedido.html',
})
export class TomaPedido {
  private catalogo = inject(CatalogoService);
  private pedidoSrv = inject(PedidoService);
  private router = inject(Router);
  private toast = inject(ToastService);

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

  protected bloquearNoEnteros(e: KeyboardEvent): void {
    if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }

  protected setCantidad(p: Producto, valor: number | string | null): void {
    const n = Math.max(0, Math.floor(Number(valor) || 0));
    this.cantidades.update((c) => ({ ...c, [p.id!]: n }));
  }

  protected seleccionarCliente(c: Cliente): void {
    this.clienteId.set(this.clienteId() === c.id ? null : c.id!);
  }


  protected mostrarFormCliente = signal(false);
  protected nuevoCliente = signal({ nombre: '', apellido: '', telefono: '', direccion: '', email: '' });

  protected campoCliente(campo: 'nombre' | 'apellido' | 'telefono' | 'direccion' | 'email', valor: string): void {
    if (campo === 'telefono') valor = valor.replace(/\D/g, '').slice(0, 10);
    this.nuevoCliente.update((n) => ({ ...n, [campo]: valor }));
  }

  private validarNuevoCliente(): boolean {
    const n = this.nuevoCliente();
    if (!n.nombre.trim() || !n.apellido.trim() || !n.telefono.trim() || !n.email.trim() || !n.direccion.trim()) {
      this.toast.error('Completá todos los campos del cliente.');
      return false;
    }
    if (!/^\d{8,10}$/.test(n.telefono.trim())) {
      this.toast.error('El teléfono debe tener solo números, entre 8 y 10 dígitos.');
      return false;
    }
    if (!n.email.includes('@') || !n.email.includes('.com')) {
      this.toast.error('El email debe contener "@" y ".com".');
      return false;
    }
    return true;
  }
  protected soloDigitos(e: KeyboardEvent): void {
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/\d/.test(e.key)) e.preventDefault();
  }
  protected pegarSoloDigitos(e: ClipboardEvent): void {
  e.preventDefault();
  const pegado = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
  const input = e.target as HTMLInputElement;
  const nuevo = (input.value + pegado).slice(0, 10);
  input.value = nuevo;
  this.campoCliente('telefono', nuevo);
  }


  protected async guardarCliente(): Promise<void> {
    if (!this.validarNuevoCliente()) return;
    const n = this.nuevoCliente();
    const id = await this.catalogo.crearCliente({
      nombre: n.nombre.trim(),
      apellido: n.apellido.trim(),
      telefono: Number(n.telefono) || 0,
      direccion: n.direccion.trim(),
      email: n.email.trim(),
    });
    this.clientes.set(await this.catalogo.getClientesActivos());
    this.clienteId.set(id); 
    this.nuevoCliente.set({ nombre: '', apellido: '', telefono: '', direccion: '', email: '' });
    this.mostrarFormCliente.set(false);
    this.toast.exito('Cliente guardado.');
  }

  protected async eliminarCliente(c: Cliente): Promise<void> {
    if (!confirm(`¿Eliminar a ${c.nombre} ${c.apellido}?`)) return;
    await this.catalogo.eliminarCliente(c.id!);
    if (this.clienteId() === c.id) this.clienteId.set(null);
    this.clientes.set(await this.catalogo.getClientesActivos());
    this.toast.exito('Cliente eliminado.');
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
