import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Garrafa } from '../../../models/garrafa.model';
import { CatalogoService } from '../../../services/catalogo.service';
import { ToastService } from '../../../services/toast.service';
import {MAX_CAPACIDAD_KG,MAX_DESCRIPCION,MAX_PRECIO,aNumero,bloquearNegativos,bloquearNoEnteros,clamp,limpiarTexto,normalizarComparacion,validarCodigo,validarTexto} from '../../../utils/validaciones';

interface FormGarrafa {
  codigo: string;
  descripcion: string;
  capacidadKg: number | null;
  precio: number | null;
}

const FORM_VACIO: FormGarrafa = { codigo: '', descripcion: '', capacidadKg: null, precio: null };

@Component({
  selector: 'app-admin-garrafas',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './garrafas.html',
})
export class GarrafasAdmin {
  private catalogo = inject(CatalogoService);
  private toast = inject(ToastService);

  protected garrafas = toSignal(this.catalogo.garrafasTodas$(), { initialValue: [] as Garrafa[] });

  protected readonly MAX_CAPACIDAD_KG = MAX_CAPACIDAD_KG;
  protected readonly MAX_PRECIO = MAX_PRECIO;
  protected readonly MAX_DESCRIPCION = MAX_DESCRIPCION;
  protected readonly bloquearNoEnteros = bloquearNoEnteros;
  protected readonly bloquearNegativos = bloquearNegativos;

  protected guardando = signal(false);

  protected mostrarFormGarrafa = signal(false);
  protected nueva = signal<FormGarrafa>({ ...FORM_VACIO });
  protected tocadaAlta = signal(false);

  protected campo(campo: keyof FormGarrafa, valor: any): void {
    this.tocadaAlta.set(true);
    this.nueva.update((n) => ({ ...n, [campo]: this.normalizar(campo, valor) }));
  }
  private normalizar(campo: keyof FormGarrafa, valor: any): any {
    switch (campo) {
      case 'codigo':
        return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
      case 'descripcion':
        return String(valor ?? '').slice(0, MAX_DESCRIPCION);
      case 'capacidadKg': {
        const n = aNumero(valor);
        return n === null ? null : clamp(Math.floor(Math.abs(n)), 0, MAX_CAPACIDAD_KG);
      }
      case 'precio': {
        const n = aNumero(valor);
        return n === null ? null : clamp(Math.round(Math.abs(n) * 100) / 100, 0, MAX_PRECIO);
      }
      default:
        return valor;
    }
  }

  private validar(f: FormGarrafa, { conCodigo = true, idActual = null as string | null } = {}): string | null {
    if (conCodigo) {
      const eCod = validarCodigo(f.codigo);
      if (eCod) return eCod;
      const cod = limpiarTexto(f.codigo).toUpperCase();
      if (this.garrafas().some((g) => g.id !== idActual && g.codigo.toUpperCase() === cod)) {
        return `Ya existe un tipo de garrafa con el código ${cod}.`;
      }
    }

    const eDesc = validarTexto(f.descripcion, 'La descripción', { min: 2, max: MAX_DESCRIPCION });
    if (eDesc) return eDesc;
    const desc = normalizarComparacion(f.descripcion);
    if (this.garrafas().some((g) => g.id !== idActual && normalizarComparacion(g.descripcion) === desc)) {
      return 'Ya existe un tipo de garrafa con esa descripción.';
    }

    const cap = aNumero(f.capacidadKg);
    if (cap === null) return 'La capacidad es obligatoria.';
    if (cap < 0) return 'La capacidad no puede ser negativa.';
    if (!Number.isInteger(cap)) return 'La capacidad debe ser un número entero de kilos.';
    if (cap === 0) return 'La capacidad debe ser mayor a 0.';
    if (cap > MAX_CAPACIDAD_KG) return `La capacidad no puede superar los ${MAX_CAPACIDAD_KG} kg.`;

    const precio = aNumero(f.precio);
    if (precio === null) return 'El precio es obligatorio.';
    if (precio < 0) return 'El precio no puede ser negativo.';
    if (precio === 0) return 'El precio debe ser mayor a 0.';
    if (Math.round(precio * 100) !== precio * 100) return 'El precio admite como máximo dos decimales.';
    if (precio > MAX_PRECIO) return `El precio no puede superar $ ${MAX_PRECIO.toLocaleString('es-AR')}.`;

    return null;
  }

  protected errorAlta = computed(() => this.validar(this.nueva()));
  protected puedeGuardarAlta = computed(() => this.errorAlta() == null && !this.guardando());

  protected toggleFormGarrafa(): void {
    const abrir = !this.mostrarFormGarrafa();
    this.mostrarFormGarrafa.set(abrir);
    if (abrir) this.mostrarFormEditar.set(false);
    this.nueva.set({ ...FORM_VACIO });
    this.tocadaAlta.set(false);
  }

  protected async guardarGarrafa(): Promise<void> {
    if (this.guardando()) return;
    this.tocadaAlta.set(true);
    const error = this.errorAlta();
    if (error) {
      this.toast.error(error);
      return;
    }
    const n = this.nueva();
    this.guardando.set(true);
    try {
      await this.catalogo.crearGarrafa({
        codigo: limpiarTexto(n.codigo).toUpperCase(),
        descripcion: limpiarTexto(n.descripcion),
        capacidadKg: Number(n.capacidadKg),
        precio: Number(n.precio),
      });
      this.nueva.set({ ...FORM_VACIO });
      this.tocadaAlta.set(false);
      this.mostrarFormGarrafa.set(false);
      this.toast.exito('Tipo de garrafa creado.');
    } catch (e: any) {
      this.toast.error(e.message || 'Error al crear el tipo de garrafa.');
    } finally {
      this.guardando.set(false);
    }
  }

  // ─── Edición ───
  protected mostrarFormEditar = signal(false);
  protected editarId = signal<string | null>(null);
  protected editDescripcion = signal<string>('');
  protected editCapacidad = signal<number | null>(null);
  protected editPrecio = signal<number | null>(null);
  protected tocadaEdicion = signal(false);

  protected garrafaEnEdicion = computed(
    () => this.garrafas().find((g) => g.id === this.editarId()) ?? null,
  );

  protected campoEdicion(campo: 'descripcion' | 'capacidadKg' | 'precio', valor: any): void {
    this.tocadaEdicion.set(true);
    const v = this.normalizar(campo, valor);
    if (campo === 'descripcion') this.editDescripcion.set(v);
    if (campo === 'capacidadKg') this.editCapacidad.set(v);
    if (campo === 'precio') this.editPrecio.set(v);
  }

  protected errorEdicion = computed<string | null>(() => {
    const id = this.editarId();
    if (!id) return 'Elegí un tipo de garrafa para editar.';
    return this.validar(
      {
        codigo: this.garrafaEnEdicion()?.codigo ?? '',
        descripcion: this.editDescripcion(),
        capacidadKg: this.editCapacidad(),
        precio: this.editPrecio(),
      },
      { conCodigo: false, idActual: id },
    );
  });

  protected sinCambios = computed(() => {
    const g = this.garrafaEnEdicion();
    if (!g) return true;
    return (
      limpiarTexto(this.editDescripcion()) === limpiarTexto(g.descripcion) &&
      Number(this.editCapacidad()) === Number(g.capacidadKg) &&
      Number(this.editPrecio()) === Number(g.precio)
    );
  });

  protected puedeGuardarEdicion = computed(
    () => this.errorEdicion() == null && !this.sinCambios() && !this.guardando(),
  );

  protected toggleFormEditar(): void {
    const abrir = !this.mostrarFormEditar();
    this.mostrarFormEditar.set(abrir);
    if (abrir) this.mostrarFormGarrafa.set(false);
    if (!abrir) this.resetEdicion();
  }

  protected seleccionarEditar(id: string | null): void {
    this.editarId.set(id);
    this.tocadaEdicion.set(false);
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
    this.tocadaEdicion.set(false);
  }

  protected async guardarEdicion(): Promise<void> {
    if (this.guardando()) return;
    this.tocadaEdicion.set(true);
    const error = this.errorEdicion();
    if (error) {
      this.toast.error(error);
      return;
    }
    if (this.sinCambios()) {
      this.toast.error('No hay cambios para guardar.');
      return;
    }
    this.guardando.set(true);
    try {
      await this.catalogo.editarGarrafa(this.editarId()!, {
        descripcion: limpiarTexto(this.editDescripcion()),
        capacidadKg: Number(this.editCapacidad()),
        precio: Number(this.editPrecio()),
      });
      this.toast.exito('Tipo de garrafa actualizado.');
      this.mostrarFormEditar.set(false);
      this.resetEdicion();
    } catch (e: any) {
      this.toast.error(e.message || 'Error al actualizar el tipo de garrafa.');
    } finally {
      this.guardando.set(false);
    }
  }

  protected async toggleActivo(g: Garrafa): Promise<void> {
    if (g.activo && !confirm(`¿Desactivar "${g.descripcion}"? Dejará de estar disponible para pedidos y movimientos.`)) {
      return;
    }
    try {
      await this.catalogo.cambiarEstadoGarrafa(g.id, !g.activo);
      this.toast.exito(g.activo ? 'Tipo desactivado.' : 'Tipo activado.');
    } catch (e: any) {
      this.toast.error(e.message || 'No se pudo cambiar el estado.');
    }
  }
}
