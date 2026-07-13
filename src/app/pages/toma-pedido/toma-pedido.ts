import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Garrafa, nombreGarrafa } from '../../models/garrafa.model';
import { Cliente } from '../../models/cliente.model';
import { CatalogoService } from '../../services/catalogo.service';
import { ApiClienteService } from '../../services/api-cliente.service';
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
  private apiCliente = inject(ApiClienteService);
  private pedidoSrv = inject(PedidoService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private replication = inject(ReplicationService);

  protected clientes = toSignal(this.catalogo.clientesActivos$(), { initialValue: [] as Cliente[] });
  protected clientesInactivos = toSignal(this.catalogo.clientesInactivos$(), { initialValue: [] as Cliente[] });
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
  protected editandoClienteId = signal<string | null>(null);
  protected ubicInicialLat = signal<number | null>(null);
  protected ubicInicialLng = signal<number | null>(null);
  protected abrirNuevoCliente(): void {
    this.editandoClienteId.set(null);
    this.nuevoCliente.set({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });
    this.nuevoClienteUbicacion.set(null);
    this.ubicInicialLat.set(null);
    this.ubicInicialLng.set(null);
    this.quitarFotoCliente();
    this.mostrarFormCliente.set(true);
  }

  protected editarCliente(c: Cliente): void {
    this.editandoClienteId.set(c.id);
    this.nuevoCliente.set({
      nombre: c.nombre,
      apellido: c.apellido,
      dni: c.dni,
      telefono: c.telefono,
      direccion: c.direccion,
    });
    if (c.latitud != null && c.longitud != null) {
      this.nuevoClienteUbicacion.set({ lat: c.latitud, lng: c.longitud, placeId: c.placeId ?? null });
      this.ubicInicialLat.set(c.latitud);
      this.ubicInicialLng.set(c.longitud);
    } else {
      this.nuevoClienteUbicacion.set(null);
      this.ubicInicialLat.set(null);
      this.ubicInicialLng.set(null);
    }
    this.quitarFotoCliente();
    this.mostrarFormCliente.set(true);
  }

  protected toggleFormCliente(): void {
    if (this.mostrarFormCliente()) {
      this.cerrarFormCliente();
    } else {
      this.abrirNuevoCliente();
    }
  }

  protected cerrarFormCliente(): void {
    this.mostrarFormCliente.set(false);
    this.editandoClienteId.set(null);
  }
  private static readonly TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  private static readonly MAX_FOTO_BYTES = 10 * 1024 * 1024; 
  protected fotoCliente = signal<File | null>(null);
  protected fotoClientePreview = signal<string | null>(null);
  protected onFotoCliente(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!TomaPedido.TIPOS_FOTO.includes(file.type)) {
      this.toast.error('La foto debe ser JPG, PNG o WEBP.');
      input.value = '';
      return;
    }
    if (file.size > TomaPedido.MAX_FOTO_BYTES) {
      this.toast.error('La foto no puede superar los 10 MB.');
      input.value = '';
      return;
    }
    this.revocarPreview();
    this.fotoCliente.set(file);
    this.fotoClientePreview.set(URL.createObjectURL(file));
  }

  protected quitarFotoCliente(): void {
    this.revocarPreview();
    this.fotoCliente.set(null);
    this.fotoClientePreview.set(null);
  }

  private revocarPreview(): void {
    const prev = this.fotoClientePreview();
    if (prev) URL.revokeObjectURL(prev);
  }

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
    const editId = this.editandoClienteId();
    const datos = {
      nombre: n.nombre.trim(),
      apellido: n.apellido.trim(),
      dni: n.dni.trim(),
      telefono: n.telefono.trim(),
      direccion: n.direccion.trim(),
      latitud: u ? u.lat : null,
      longitud: u ? u.lng : null,
      placeId: u ? (u.placeId ?? null) : null,
    };
    try {
      let id: string;
      if (editId) {
        await this.catalogo.editarCliente(editId, datos);
        id = editId;
      } else {
        id = await this.catalogo.crearCliente(datos);
        this.clienteId.set(id);
      }
      const foto = this.fotoCliente();
      if (foto) {
        try {
          await this.apiCliente.subirFoto(Number(id), foto, 'Fachada');
        } catch {
          this.toast.error('Cliente guardado, pero no se pudo subir la foto.');
        }
      }
      this.nuevoCliente.set({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });
      this.nuevoClienteUbicacion.set(null);
      this.ubicInicialLat.set(null);
      this.ubicInicialLng.set(null);
      this.quitarFotoCliente();
      this.mostrarFormCliente.set(false);
      this.editandoClienteId.set(null);
      this.toast.exito(editId ? 'Cliente actualizado.' : 'Cliente guardado.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al guardar el cliente.');
    }
  }

  protected async darBajaCliente(c: Cliente): Promise<void> {
    if (!confirm(`¿Dar de baja a ${c.nombre} ${c.apellido}? Podrás reactivarlo más adelante.`)) return;
    try {
      await this.catalogo.darBajaCliente(c.id);
      if (this.clienteId() === c.id) this.clienteId.set(null);
      this.toast.exito('Cliente dado de baja.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al dar de baja el cliente.');
    }
  }

  protected async reactivarCliente(c: Cliente): Promise<void> {
    try {
      await this.catalogo.reactivarCliente(c.id);
      this.toast.exito(`${c.nombre} ${c.apellido} reactivado.`);
    } catch (e: any) {
      this.toast.error(e.message || 'Error al reactivar el cliente.');
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
