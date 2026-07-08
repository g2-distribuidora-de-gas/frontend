import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Garrafa, TipoGarrafa, nombreGarrafa } from '../../models/garrafa.model';
import { Cliente } from '../../models/cliente.model';
import { CatalogoService } from '../../services/catalogo.service';
import { PedidoService } from '../../services/pedido.service';
import { ToastService } from '../../services/toast.service';
import { ReplicationService } from '../../services/replication.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { MapaPicker, UbicacionSeleccionada } from '../../components/mapa-picker/mapa-picker';

@Component({
  selector: 'app-toma-pedido',
  imports: [FormsModule, DecimalPipe, MapaPicker],
  templateUrl: './toma-pedido.html',
})
export class TomaPedido {
  private catalogo = inject(CatalogoService);
  private pedidoSrv = inject(PedidoService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private replication = inject(ReplicationService);

  protected clientes = signal<Cliente[]>([]);
  protected clientesInactivos = signal<Cliente[]>([]);
  protected mostrarInactivos = signal(false);
  // Lista reactiva: se actualiza sola cuando cambia el stock/precio en RxDB
  protected garrafas = toSignal(this.catalogo.garrafasActivas$(), { initialValue: [] as Garrafa[] });
  protected clienteId = signal<string | null>(null);
  protected busqueda = signal('');
  protected observaciones = signal('');
  protected cantidades = signal<Record<string, number>>({});
  protected guardando = signal(false);
  protected exito = signal<string | null>(null);

  protected clientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.clientes();
    return this.clientes().filter((c) =>
      `${c.nombre} ${c.apellido} ${c.direccion} ${c.dni}`.toLowerCase().includes(q),
    );
  });

  protected clienteSeleccionado = computed(
    () => this.clientes().find((c) => c.id === this.clienteId()) ?? null,
  );

  protected items = computed(() => {
    const cant = this.cantidades();
    return this.garrafas()
      .filter((g) => (cant[g.id] ?? 0) > 0)
      .map((g) => ({ garrafa: g, cantidad: cant[g.id], subtotal: cant[g.id] * g.precio }));
  });

  protected total = computed(() => this.items().reduce((acc, i) => acc + i.subtotal, 0));
  protected puedeConfirmar = computed(() => !!this.clienteId() && this.items().length > 0 && !this.guardando());

  protected nombreGarrafa = nombreGarrafa;

  constructor() {
    this.recargarClientes();
  }

  private async recargarClientes(): Promise<void> {
    this.clientes.set(await this.catalogo.getClientesActivos());
    this.clientesInactivos.set(await this.catalogo.getClientesInactivos());
  }

  protected cantidadDe(g: Garrafa): number {
    return this.cantidades()[g.id] ?? 0;
  }

  protected stockDe(g: Garrafa): number {
    return g.stockDisponible ?? Infinity;
  }

  protected sinStock(g: Garrafa): boolean {
    return this.stockDe(g) <= 0;
  }

  protected ajustar(g: Garrafa, delta: number): void {
    const tope = this.stockDe(g);
    this.cantidades.update((c) => {
      const nueva = Math.min(tope, Math.max(0, (c[g.id] ?? 0) + delta));
      return { ...c, [g.id]: nueva };
    });
    if (delta > 0 && this.cantidadDe(g) >= tope) {
      this.toast.error(`Sin stock suficiente de ${nombreGarrafa(g.tipo)}.`);
    }
  }

  protected bloquearNoEnteros(e: KeyboardEvent): void {
    if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }

  /** Toma el valor tipeado en el input, lo clampea al stock y lo refleja en la caja */
  protected setCantidad(g: Garrafa, el: HTMLInputElement): void {
    const tope = this.stockDe(g);
    const n = Math.min(tope, Math.max(0, Math.floor(Number(el.value) || 0)));
    el.value = String(n);
    this.cantidades.update((c) => ({ ...c, [g.id]: n }));
  }

  protected seleccionarCliente(c: Cliente): void {
    this.clienteId.set(this.clienteId() === c.id ? null : c.id);
  }


  protected mostrarFormCliente = signal(false);
  protected nuevoCliente = signal({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });
  protected nuevoClienteUbicacion = signal<UbicacionSeleccionada | null>(null);

  protected onUbicacionCliente(u: UbicacionSeleccionada): void {
    this.nuevoClienteUbicacion.set(u);
    if (u.direccion && !this.nuevoCliente().direccion.trim()) {
      this.nuevoCliente.update((n) => ({ ...n, direccion: u.direccion! }));
    }
  }

  protected campoCliente(campo: 'nombre' | 'apellido' | 'dni' | 'telefono' | 'direccion', valor: string): void {
    if (campo === 'telefono') valor = valor.replace(/\D/g, '').slice(0, 10);
    if (campo === 'dni') valor = valor.replace(/\D/g, '').slice(0, 10);
    if (campo === 'nombre' || campo === 'apellido') valor = valor.replace(/\d/g, '');
    this.nuevoCliente.update((n) => ({ ...n, [campo]: valor }));
  }

  private validarNuevoCliente(): boolean {
    const n = this.nuevoCliente();
    if (!n.nombre.trim() || !n.apellido.trim() || !n.dni.trim() || !n.telefono.trim() || !n.direccion.trim()) {
      this.toast.error('Completá todos los campos del cliente.');
      return false;
    }
    if (/\d/.test(n.nombre) || /\d/.test(n.apellido)) {
      this.toast.error('El nombre y el apellido no pueden contener números.');
      return false;
    }
    if (!/^\d{7,10}$/.test(n.dni.trim())) {
      this.toast.error('El DNI debe tener entre 7 y 10 dígitos.');
      return false;
    }
    if (!/^\d{8,10}$/.test(n.telefono.trim())) {
      this.toast.error('El teléfono debe tener entre 8 y 10 dígitos.');
      return false;
    }
    return true;
  }

  protected soloDigitos(e: KeyboardEvent): void {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/\d/.test(e.key)) e.preventDefault();
  }

  protected sinDigitos(e: KeyboardEvent): void {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /\d/.test(e.key)) e.preventDefault();
  }

  protected pegarSoloDigitos(e: ClipboardEvent, campo: 'telefono' | 'dni'): void {
    e.preventDefault();
    const pegado = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    const input = e.target as HTMLInputElement;
    const maxLen = 10;
    const nuevo = (input.value + pegado).slice(0, maxLen);
    input.value = nuevo;
    this.campoCliente(campo, nuevo);
  }

  protected async guardarCliente(): Promise<void> {
    if (!this.validarNuevoCliente()) return;
    const n = this.nuevoCliente();
    const u = this.nuevoClienteUbicacion();
    try {
      const id = await this.catalogo.crearCliente({
        nombre: n.nombre.trim(),
        apellido: n.apellido.trim(),
        dni: n.dni.trim(),
        telefono: n.telefono.trim(),
        direccion: n.direccion.trim(),
        latitud: u ? u.lat : null,
        longitud: u ? u.lng : null,
        placeId: u ? (u.placeId ?? null) : null,
      });
      await this.recargarClientes();
      this.clienteId.set(id);
      this.nuevoCliente.set({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });
      this.nuevoClienteUbicacion.set(null);
      this.mostrarFormCliente.set(false);
      this.toast.exito('Cliente guardado.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al guardar el cliente.');
    }
  }

  protected async darBajaCliente(c: Cliente): Promise<void> {
    if (!confirm(`¿Dar de baja a ${c.nombre} ${c.apellido}? Podrás reactivarlo más adelante.`)) return;
    try {
      await this.catalogo.darBajaCliente(c.id);
      if (this.clienteId() === c.id) this.clienteId.set(null);
      await this.recargarClientes();
      this.toast.exito('Cliente dado de baja.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al dar de baja el cliente.');
    }
  }

  protected async reactivarCliente(c: Cliente): Promise<void> {
    try {
      await this.catalogo.reactivarCliente(c.id);
      await this.recargarClientes();
      this.toast.exito(`${c.nombre} ${c.apellido} reactivado.`);
    } catch (e: any) {
      this.toast.error(e.message || 'Error al reactivar el cliente.');
    }
  }

  // ─── Formulario nueva garrafa ───

  protected mostrarFormGarrafa = signal(false);
  protected nuevaGarrafa = signal<{ tipo: TipoGarrafa | ''; precio: number | null; stock: number | null }>({
    tipo: '',
    precio: null,
    stock: null,
  });

  private static readonly CAPACIDADES: Record<TipoGarrafa, number> = {
    GARRAFA_10KG: 10,
    GARRAFA_15KG: 15,
    GARRAFA_45KG: 45,
  };

  /** Tipos que todavía no existen (el backend exige tipo único) */
  protected tiposDisponibles = computed(() => {
    const existentes = new Set(this.garrafas().map((g) => g.tipo));
    return (Object.keys(TomaPedido.CAPACIDADES) as TipoGarrafa[]).filter((t) => !existentes.has(t));
  });

  protected campoGarrafa(campo: 'tipo' | 'precio' | 'stock', valor: any): void {
    this.nuevaGarrafa.update((n) => ({ ...n, [campo]: valor }));
  }

  protected async guardarGarrafa(): Promise<void> {
    const n = this.nuevaGarrafa();
    if (!n.tipo) {
      this.toast.error('Seleccioná el tipo de garrafa.');
      return;
    }
    if (!n.precio || n.precio <= 0) {
      this.toast.error('El precio debe ser mayor a 0.');
      return;
    }
    if (n.stock === null || n.stock < 0 || !Number.isInteger(Number(n.stock))) {
      this.toast.error('El stock debe ser un número entero mayor o igual a 0.');
      return;
    }
    try {
      await this.catalogo.crearGarrafa({
        tipo: n.tipo,
        capacidadKg: TomaPedido.CAPACIDADES[n.tipo],
        precio: n.precio,
        stockDisponible: n.stock,
      });
      this.nuevaGarrafa.set({ tipo: '', precio: null, stock: null });
      this.mostrarFormGarrafa.set(false);
      this.toast.exito('Garrafa creada.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al crear la garrafa.');
    }
  }

  // ─── Editar garrafa (precio / stock) ───

  protected mostrarFormEditar = signal(false);
  protected editarId = signal<string | null>(null);
  protected editPrecio = signal<number | null>(null);
  protected editStock = signal<number>(0);

  protected garrafaEnEdicion = computed(
    () => this.garrafas().find((g) => g.id === this.editarId()) ?? null,
  );

  protected toggleFormEditar(): void {
    const abrir = !this.mostrarFormEditar();
    this.mostrarFormEditar.set(abrir);
    // al abrir edición cerramos el form de creación para no encimarlos
    if (abrir) this.mostrarFormGarrafa.set(false);
    if (!abrir) this.resetEdicion();
  }

  protected seleccionarEditar(id: string | null): void {
    this.editarId.set(id);
    const g = this.garrafas().find((x) => x.id === id);
    this.editPrecio.set(g ? g.precio : null);
    this.editStock.set(g ? (g.stockDisponible ?? 0) : 0);
  }

  protected ajustarEditStock(delta: number): void {
    this.editStock.update((s) => Math.max(0, s + delta));
  }

  protected setEditStock(valor: number | string | null): void {
    this.editStock.set(Math.max(0, Math.floor(Number(valor) || 0)));
  }

  private resetEdicion(): void {
    this.editarId.set(null);
    this.editPrecio.set(null);
    this.editStock.set(0);
  }

  protected async guardarEdicion(): Promise<void> {
    const id = this.editarId();
    if (!id) {
      this.toast.error('Elegí una garrafa para editar.');
      return;
    }
    const precio = this.editPrecio();
    if (!precio || precio <= 0) {
      this.toast.error('El precio debe ser mayor a 0.');
      return;
    }
    const stock = this.editStock();
    if (stock < 0 || !Number.isInteger(Number(stock))) {
      this.toast.error('El stock debe ser un entero mayor o igual a 0.');
      return;
    }
    try {
      await this.catalogo.editarGarrafa(id, { precio, stockDisponible: stock });
      this.toast.exito('Garrafa actualizada.');
      this.mostrarFormEditar.set(false);
      this.resetEdicion();
    } catch (e: any) {
      this.toast.error(e.message || 'Error al actualizar la garrafa.');
    }
  }

  // ─── Confirmar pedido ───

  protected async confirmar(): Promise<void> {
    if (!this.puedeConfirmar()) return;
    this.guardando.set(true);
    try {
      const cliente = this.clienteSeleccionado()!;
      const uuid = await this.pedidoSrv.crearPedido(
        this.clienteId()!,
        cliente.direccion,
        this.items().map((i) => ({
          garrafaId: i.garrafa.id,
          // red de seguridad: nunca mandar más que el stock disponible
          cantidad: Math.min(i.cantidad, i.garrafa.stockDisponible ?? i.cantidad),
          precioUnitario: i.garrafa.precio,
        })),
        this.observaciones().trim(),
      );
      this.exito.set(uuid);
      this.cantidades.set({});
      this.observaciones.set('');
      this.clienteId.set(null);
      this.busqueda.set('');

      // La replicación se encarga de sincronizar automáticamente
      if (navigator.onLine) {
        this.replication.resincronizar();
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected verPedidos(): void {
    this.router.navigate(['/pedidos']);
  }
}
