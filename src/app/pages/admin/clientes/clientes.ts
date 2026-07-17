import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cliente } from '../../../models/cliente.model';
import { CatalogoService } from '../../../services/catalogo.service';
import { ToastService } from '../../../services/toast.service';
import { toSignal } from '@angular/core/rxjs-interop';

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

  protected async darBaja(c: Cliente): Promise<void> {
    if (!confirm(`¿Dar de baja a ${c.nombre} ${c.apellido}? Podrás reactivarlo más adelante.`)) return;
    this.procesando.set(true);
    try {
      await this.catalogo.darBajaCliente(c.id);
      this.toast.exito('Cliente dado de baja.');
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
