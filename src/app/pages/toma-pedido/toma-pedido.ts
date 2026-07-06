import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { Garrafa, TipoGarrafa, nombreGarrafa } from '../../models/garrafa.model';
import { Usuario } from '../../models/usuario.model';
import { CatalogoService } from '../../services/catalogo.service';
import { PedidoService } from '../../services/pedido.service';
import { ToastService } from '../../services/toast.service';
import { ReplicationService } from '../../services/replication.service';

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
  private replication = inject(ReplicationService);

  protected usuarios = signal<Usuario[]>([]);
  protected usuariosInactivos = signal<Usuario[]>([]);
  protected mostrarInactivos = signal(false);
  protected garrafas = signal<Garrafa[]>([]);
  protected usuarioId = signal<string | null>(null);
  protected busqueda = signal('');
  protected observaciones = signal('');
  protected cantidades = signal<Record<string, number>>({});
  protected guardando = signal(false);
  protected exito = signal<string | null>(null);

  protected usuariosFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.usuarios();
    return this.usuarios().filter((u) =>
      `${u.nombre} ${u.apellido} ${u.direccion} ${u.dni}`.toLowerCase().includes(q),
    );
  });

  protected usuarioSeleccionado = computed(
    () => this.usuarios().find((u) => u.id === this.usuarioId()) ?? null,
  );

  protected items = computed(() => {
    const cant = this.cantidades();
    return this.garrafas()
      .filter((g) => (cant[g.id] ?? 0) > 0)
      .map((g) => ({ garrafa: g, cantidad: cant[g.id], subtotal: cant[g.id] * g.precio }));
  });

  protected total = computed(() => this.items().reduce((acc, i) => acc + i.subtotal, 0));
  protected puedeConfirmar = computed(() => !!this.usuarioId() && this.items().length > 0 && !this.guardando());

  protected nombreGarrafa = nombreGarrafa;

  constructor() {
    this.recargarUsuarios();
    this.catalogo.getGarrafasActivas().then((g) => this.garrafas.set(g));
  }

  private async recargarUsuarios(): Promise<void> {
    this.usuarios.set(await this.catalogo.getUsuariosActivos());
    this.usuariosInactivos.set(await this.catalogo.getUsuariosInactivos());
  }

  protected cantidadDe(g: Garrafa): number {
    return this.cantidades()[g.id] ?? 0;
  }

  protected ajustar(g: Garrafa, delta: number): void {
    this.cantidades.update((c) => {
      const nueva = Math.max(0, (c[g.id] ?? 0) + delta);
      return { ...c, [g.id]: nueva };
    });
  }

  protected bloquearNoEnteros(e: KeyboardEvent): void {
    if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }

  protected setCantidad(g: Garrafa, valor: number | string | null): void {
    const n = Math.max(0, Math.floor(Number(valor) || 0));
    this.cantidades.update((c) => ({ ...c, [g.id]: n }));
  }

  protected seleccionarUsuario(u: Usuario): void {
    this.usuarioId.set(this.usuarioId() === u.id ? null : u.id);
  }

  // ─── Formulario nuevo usuario ───

  protected mostrarFormUsuario = signal(false);
  protected nuevoUsuario = signal({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });

  protected campoUsuario(campo: 'nombre' | 'apellido' | 'dni' | 'telefono' | 'direccion', valor: string): void {
    if (campo === 'telefono') valor = valor.replace(/\D/g, '').slice(0, 10);
    if (campo === 'dni') valor = valor.replace(/\D/g, '').slice(0, 10);
    if (campo === 'nombre' || campo === 'apellido') valor = valor.replace(/\d/g, '');
    this.nuevoUsuario.update((n) => ({ ...n, [campo]: valor }));
  }

  private validarNuevoUsuario(): boolean {
    const n = this.nuevoUsuario();
    if (!n.nombre.trim() || !n.apellido.trim() || !n.dni.trim() || !n.telefono.trim() || !n.direccion.trim()) {
      this.toast.error('Completá todos los campos del usuario.');
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
    this.campoUsuario(campo, nuevo);
  }

  protected async guardarUsuario(): Promise<void> {
    if (!this.validarNuevoUsuario()) return;
    const n = this.nuevoUsuario();
    try {
      const id = await this.catalogo.crearUsuario({
        nombre: n.nombre.trim(),
        apellido: n.apellido.trim(),
        dni: n.dni.trim(),
        telefono: n.telefono.trim(),
        direccion: n.direccion.trim(),
      });
      await this.recargarUsuarios();
      this.usuarioId.set(id);
      this.nuevoUsuario.set({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' });
      this.mostrarFormUsuario.set(false);
      this.toast.exito('Usuario guardado.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al guardar el usuario.');
    }
  }

  protected async darBajaUsuario(u: Usuario): Promise<void> {
    if (!confirm(`¿Dar de baja a ${u.nombre} ${u.apellido}? Podrás reactivarlo más adelante.`)) return;
    try {
      await this.catalogo.darBajaUsuario(u.id);
      if (this.usuarioId() === u.id) this.usuarioId.set(null);
      await this.recargarUsuarios();
      this.toast.exito('Usuario dado de baja.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al dar de baja el usuario.');
    }
  }

  protected async reactivarUsuario(u: Usuario): Promise<void> {
    try {
      await this.catalogo.reactivarUsuario(u.id);
      await this.recargarUsuarios();
      this.toast.exito(`${u.nombre} ${u.apellido} reactivado.`);
    } catch (e: any) {
      this.toast.error(e.message || 'Error al reactivar el usuario.');
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
      this.garrafas.set(await this.catalogo.getGarrafasActivas());
      this.nuevaGarrafa.set({ tipo: '', precio: null, stock: null });
      this.mostrarFormGarrafa.set(false);
      this.toast.exito('Garrafa creada.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al crear la garrafa.');
    }
  }

  protected async confirmar(): Promise<void> {
    if (!this.puedeConfirmar()) return;
    this.guardando.set(true);
    try {
      const usuario = this.usuarioSeleccionado()!;
      const uuid = await this.pedidoSrv.crearPedido(
        this.usuarioId()!,
        usuario.direccion,
        this.items().map((i) => ({
          garrafaId: i.garrafa.id,
          cantidad: i.cantidad,
          precioUnitario: i.garrafa.precio,
        })),
        this.observaciones().trim(),
      );
      this.exito.set(uuid);
      this.cantidades.set({});
      this.observaciones.set('');
      this.usuarioId.set(null);
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
