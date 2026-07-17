import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cliente } from '../../../models/cliente.model';
import { CatalogoService } from '../../../services/catalogo.service';
import { ToastService } from '../../../services/toast.service';
import { toSignal } from '@angular/core/rxjs-interop';

interface FormCliente {
  nombre: string;
  apellido: string;
  telefono: string;
  direccion: string;
}

const FORM_VACIO: FormCliente = {
  nombre: '',
  apellido: '',
  telefono: '',
  direccion: '',
};

@Component({
  selector: 'app-admin-clientes',
  imports: [FormsModule],
  templateUrl: './clientes.html',
})
export class ClientesAdmin {
  private catalogo = inject(CatalogoService);
  private toast = inject(ToastService);

  protected activos = toSignal(this.catalogo.clientesActivos$(), { initialValue: [] as Cliente[] });
  protected inactivos = toSignal(this.catalogo.clientesInactivos$(), { initialValue: [] as Cliente[] });
  protected busqueda = signal('');
  protected procesando = signal(false);

  protected activosFiltrados = computed(() => this.filtrar(this.activos()));
  protected inactivosFiltrados = computed(() => this.filtrar(this.inactivos()));
  protected editando = signal<Cliente | null>(null);
  protected form = signal<FormCliente>({ ...FORM_VACIO });
  protected guardando = signal(false);
  protected bajaPendiente = signal<Cliente | null>(null);

  private filtrar(lista: Cliente[]): Cliente[] {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return lista;
    return lista.filter((c) =>
      `${c.nombre} ${c.apellido} ${c.direccion} ${c.telefono}`.toLowerCase().includes(q),
    );
  }

  protected nombre(c: Cliente): string {
    return c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre;
  }

  protected abrirEdicion(c: Cliente): void {
    this.editando.set(c);
    this.form.set({
      nombre: c.nombre,
      apellido: c.apellido ?? '',
      telefono: c.telefono ?? '',
      direccion: c.direccion,
    });
  }

  protected cerrarEdicion(): void {
    this.editando.set(null);
    this.form.set({ ...FORM_VACIO });
  }

  protected campo<K extends keyof FormCliente>(campo: K, valor: string): void {
    let v = valor;
    if (campo === 'nombre' || campo === 'apellido') v = v.replace(/\d/g, '');
    if (campo === 'telefono') v = v.replace(/\D/g, '').slice(0, 10);
    this.form.update((f) => ({ ...f, [campo]: v }));
  }

  protected sinDigitos(e: KeyboardEvent): void {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /\d/.test(e.key)) e.preventDefault();
  }

  protected soloDigitos(e: KeyboardEvent): void {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/\d/.test(e.key)) e.preventDefault();
  }

  private validar(): string | null {
    const f = this.form();
    if (!f.nombre.trim() || !f.apellido.trim()) return 'Nombre y apellido son obligatorios.';
    if (/\d/.test(f.nombre) || /\d/.test(f.apellido)) return 'Nombre y apellido no pueden tener números.';
    if (f.telefono.trim() && !/^\d{8,10}$/.test(f.telefono.trim()))
      return 'El teléfono debe tener entre 8 y 10 dígitos.';
    return null;
  }

  protected async guardarEdicion(): Promise<void> {
    if (this.guardando()) return;
    const c = this.editando();
    if (!c) return;
    const error = this.validar();
    if (error) {
      this.toast.error(error);
      return;
    }
    const f = this.form();
    this.guardando.set(true);
    try {
      await this.catalogo.editarCliente(c.id, {
        nombre: f.nombre.trim(),
        apellido: f.apellido.trim(),
        telefono: f.telefono.trim(),
        direccion: f.direccion.trim() || 'sin direccion',
        latitud: c.latitud ?? null,
        longitud: c.longitud ?? null,
        placeId: c.placeId ?? null,
      });
      this.toast.exito('Cliente actualizado.');
      this.cerrarEdicion();
    } catch (e: any) {
      this.toast.error(e.message || 'Error al actualizar el cliente.');
    } finally {
      this.guardando.set(false);
    }
  }

  protected pedirBaja(c: Cliente): void {
    this.bajaPendiente.set(c);
  }

  protected cancelarBaja(): void {
    this.bajaPendiente.set(null);
  }

  protected async confirmarBaja(): Promise<void> {
    const c = this.bajaPendiente();
    if (!c) return;
    this.procesando.set(true);
    try {
      await this.catalogo.darBajaCliente(c.id);
      this.toast.exito('Cliente dado de baja.');
      this.bajaPendiente.set(null);
    } catch (e: any) {
      this.toast.error(e.message || 'Error al dar de baja el cliente.');
    } finally {
      this.procesando.set(false);
    }
  }

  protected async reactivar(c: Cliente): Promise<void> {
    this.procesando.set(true);
    try {
      await this.catalogo.reactivarCliente(c.id);
      this.toast.exito(`${c.nombre} ${c.apellido} reactivado.`);
    } catch (e: any) {
      this.toast.error(e.message || 'Error al reactivar el cliente.');
    } finally {
      this.procesando.set(false);
    }
  }
}
