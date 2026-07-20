import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Garrafa } from '../../../models/garrafa.model';
import { CatalogoService } from '../../../services/catalogo.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-admin-garrafas',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './garrafas.html',
})
export class GarrafasAdmin {
  private catalogo = inject(CatalogoService);
  private toast = inject(ToastService);

  protected garrafas = toSignal(this.catalogo.garrafasTodas$(), { initialValue: [] as Garrafa[] });

  protected bloquearNoEnteros(e: KeyboardEvent): void {
    if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }

  // ─── Alta ───
  protected mostrarFormGarrafa = signal(false);
  protected nueva = signal<{ codigo: string; descripcion: string; capacidadKg: number | null; precio: number | null }>({
    codigo: '',
    descripcion: '',
    capacidadKg: null,
    precio: null,
  });

  protected campo(campo: 'codigo' | 'descripcion' | 'capacidadKg' | 'precio', valor: any): void {
    this.nueva.update((n) => ({ ...n, [campo]: valor }));
  }

  protected async guardarGarrafa(): Promise<void> {
    const n = this.nueva();
    if (!n.codigo.trim()) {
      this.toast.error('Ingresá el código (ej: 10KG).');
      return;
    }
    if (!n.descripcion.trim()) {
      this.toast.error('Ingresá la descripción.');
      return;
    }
    if (n.capacidadKg === null || n.capacidadKg <= 0 || !Number.isInteger(Number(n.capacidadKg))) {
      this.toast.error('La capacidad debe ser un entero mayor a 0.');
      return;
    }
    if (n.precio === null || n.precio < 0) {
      this.toast.error('El precio no puede ser negativo.');
      return;
    }
    try {
      await this.catalogo.crearGarrafa({
        codigo: n.codigo.trim().toUpperCase(),
        descripcion: n.descripcion.trim(),
        capacidadKg: Number(n.capacidadKg),
        precio: Number(n.precio),
      });
      this.nueva.set({ codigo: '', descripcion: '', capacidadKg: null, precio: null });
      this.mostrarFormGarrafa.set(false);
      this.toast.exito('Tipo de garrafa creado.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al crear el tipo de garrafa.');
    }
  }

  // ─── Edición ───
  protected mostrarFormEditar = signal(false);
  protected editarId = signal<string | null>(null);
  protected editDescripcion = signal<string>('');
  protected editCapacidad = signal<number | null>(null);
  protected editPrecio = signal<number | null>(null);

  protected garrafaEnEdicion = computed(
    () => this.garrafas().find((g) => g.id === this.editarId()) ?? null,
  );

  protected toggleFormEditar(): void {
    const abrir = !this.mostrarFormEditar();
    this.mostrarFormEditar.set(abrir);
    if (abrir) this.mostrarFormGarrafa.set(false);
    if (!abrir) this.resetEdicion();
  }

  protected seleccionarEditar(id: string | null): void {
    this.editarId.set(id);
    const g = this.garrafas().find((x) => x.id === id);
    this.editDescripcion.set(g ? g.descripcion : '');
    this.editCapacidad.set(g ? g.capacidadKg : null);
    this.editPrecio.set(g ? g.precio : null);
  }

  private resetEdicion(): void {
    this.editarId.set(null);
    this.editDescripcion.set('');
    this.editCapacidad.set(null);
    this.editPrecio.set(null);
  }

  protected async guardarEdicion(): Promise<void> {
    const id = this.editarId();
    if (!id) {
      this.toast.error('Elegí un tipo de garrafa para editar.');
      return;
    }
    const descripcion = this.editDescripcion().trim();
    const capacidadKg = this.editCapacidad();
    const precio = this.editPrecio();
    if (!descripcion) {
      this.toast.error('La descripción no puede estar vacía.');
      return;
    }
    if (capacidadKg === null || capacidadKg <= 0) {
      this.toast.error('La capacidad debe ser mayor a 0.');
      return;
    }
    if (precio === null || precio < 0) {
      this.toast.error('El precio no puede ser negativo.');
      return;
    }
    try {
      await this.catalogo.editarGarrafa(id, {
        descripcion,
        capacidadKg: Number(capacidadKg),
        precio: Number(precio),
      });
      this.toast.exito('Tipo de garrafa actualizado.');
      this.mostrarFormEditar.set(false);
      this.resetEdicion();
    } catch (e: any) {
      this.toast.error(e.message || 'Error al actualizar el tipo de garrafa.');
    }
  }

  protected async toggleActivo(g: Garrafa): Promise<void> {
    try {
      await this.catalogo.cambiarEstadoGarrafa(g.id, !g.activo);
      this.toast.exito(g.activo ? 'Tipo desactivado.' : 'Tipo activado.');
    } catch (e: any) {
      this.toast.error(e.message || 'No se pudo cambiar el estado.');
    }
  }
}
