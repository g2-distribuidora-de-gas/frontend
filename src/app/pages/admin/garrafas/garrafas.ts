import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Garrafa, TipoGarrafa, nombreGarrafa } from '../../../models/garrafa.model';
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

  protected garrafas = toSignal(this.catalogo.garrafasActivas$(), { initialValue: [] as Garrafa[] });

  protected nombreGarrafa = nombreGarrafa;

  private static readonly CAPACIDADES: Record<TipoGarrafa, number> = {
    GARRAFA_10KG: 10,
    GARRAFA_15KG: 15,
    GARRAFA_45KG: 45,
  };

  protected tiposDisponibles = computed(() => {
    const existentes = new Set(this.garrafas().map((g) => g.tipo));
    return (Object.keys(GarrafasAdmin.CAPACIDADES) as TipoGarrafa[]).filter((t) => !existentes.has(t));
  });

  protected bloquearNoEnteros(e: KeyboardEvent): void {
    if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
  }


  protected mostrarFormGarrafa = signal(false);
  protected nuevaGarrafa = signal<{ tipo: TipoGarrafa | ''; precio: number | null; stock: number | null }>({
    tipo: '',
    precio: null,
    stock: null,
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
        capacidadKg: GarrafasAdmin.CAPACIDADES[n.tipo],
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
}
