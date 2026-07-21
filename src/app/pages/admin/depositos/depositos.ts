import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogoService } from '../../../services/catalogo.service';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ToastService } from '../../../services/toast.service';
import {Deposito,DepositoRequest,TIPO_DEPOSITO_LABELS,TipoDeposito} from '../../../models/deposito.model';
import {MAX_DESCRIPCION, MAX_NOMBRE, limpiarTexto, normalizarComparacion, normalizarPatente,validarPatente, validarTexto} from '../../../utils/validaciones';

interface RepartidorOpcion {
  id: number;
  nombre: string;
}

interface FormDeposito {
  nombre: string;
  tipo: TipoDeposito | '';
  descripcion: string;
  vehiculoPatente: string;
  repartidorId: number | null;
}

const FORM_VACIO: FormDeposito = {
  nombre: '',
  tipo: '',
  descripcion: '',
  vehiculoPatente: '',
  repartidorId: null,
};

@Component({
  selector: 'app-admin-depositos',
  imports: [FormsModule],
  templateUrl: './depositos.html',
})
export class DepositosAdmin implements OnInit {
  private catalogo = inject(CatalogoService);
  private apiUsuario = inject(ApiUsuarioService);
  private toast = inject(ToastService);

  protected depositos = toSignal(this.catalogo.depositosTodos$(), { initialValue: [] as Deposito[] });
  protected repartidores = signal<RepartidorOpcion[]>([]);

  protected readonly TIPO_LABELS = TIPO_DEPOSITO_LABELS;
  protected readonly TIPOS: TipoDeposito[] = ['DEPOSITO_CENTRAL', 'CAMION', 'SUCURSAL', 'PLANTA', 'TALLER'];
  protected readonly MAX_NOMBRE = MAX_NOMBRE;
  protected readonly MAX_DESCRIPCION = MAX_DESCRIPCION;

  protected mostrarForm = signal(false);
  protected editId = signal<string | null>(null);
  protected guardando = signal(false);
  protected tocado = signal(false);
  protected form = signal<FormDeposito>({ ...FORM_VACIO });

  protected esCamion = computed(() => this.form().tipo === 'CAMION');
  protected tipoBloqueado = computed(() => this.editId() != null);

  async ngOnInit(): Promise<void> {
    try {
      await this.catalogo.refrescarDepositos();
    } catch {
    }
    try {
      const usuarios = await this.apiUsuario.listarTodos();
      this.repartidores.set(
        usuarios
          .filter((u) => u.rol === 'REPARTIDOR' && u.activo)
          .map((u) => ({ id: u.id, nombre: u.nombreCompleto })),
      );
    } catch {
    }
  }

  protected campo(campo: keyof FormDeposito, valor: any): void {
    this.tocado.set(true);
    let v = valor;
    if (campo === 'nombre') v = String(valor ?? '').slice(0, MAX_NOMBRE);
    if (campo === 'descripcion') v = String(valor ?? '').slice(0, MAX_DESCRIPCION);
    if (campo === 'vehiculoPatente') v = normalizarPatente(valor);
    this.form.update((f) => ({ ...f, [campo]: v }));
  }

  protected repartidoresDisponibles = computed(() => {
    const editId = this.editId();
    const ocupados = new Set(
      this.depositos()
        .filter((d) => d.tipo === 'CAMION' && d.activo && d.id !== editId && d.repartidorId != null)
        .map((d) => d.repartidorId as number),
    );
    return this.repartidores().filter((r) => !ocupados.has(r.id) || r.id === this.form().repartidorId);
  });

  protected error = computed<string | null>(() => {
    const f = this.form();
    const editId = this.editId();

    const eNombre = validarTexto(f.nombre, 'El nombre', { min: 2, max: MAX_NOMBRE });
    if (eNombre) return eNombre;
    const nombre = normalizarComparacion(f.nombre);
    if (this.depositos().some((d) => d.id !== editId && normalizarComparacion(d.nombre) === nombre)) {
      return 'Ya existe un depósito con ese nombre.';
    }

    if (!f.tipo) return 'Seleccioná el tipo de depósito.';
    if (!this.TIPOS.includes(f.tipo)) return 'El tipo de depósito no es válido.';

    const eDesc = validarTexto(f.descripcion, 'La descripción', {
      max: MAX_DESCRIPCION,
      obligatorio: false,
    });
    if (eDesc) return eDesc;

    if (f.tipo === 'CAMION') {
      const patente = normalizarPatente(f.vehiculoPatente);
      if (!patente) return 'La patente es obligatoria para un camión.';
      const ePat = validarPatente(patente);
      if (ePat) return ePat;
      if (this.depositos().some((d) => d.id !== editId && normalizarPatente(d.vehiculoPatente) === patente)) {
        return `Ya hay un camión registrado con la patente ${patente}.`;
      }
      if (f.repartidorId != null) {
        const ocupado = this.depositos().find(
          (d) => d.id !== editId && d.tipo === 'CAMION' && d.activo && d.repartidorId === f.repartidorId,
        );
        if (ocupado) return `Ese repartidor ya está asignado al camión "${ocupado.nombre}".`;
      }
    }

    return null;
  });

  protected puedeGuardar = computed(() => this.error() == null && !this.guardando());

  protected abrirNuevo(): void {
    this.editId.set(null);
    this.form.set({ ...FORM_VACIO });
    this.tocado.set(false);
    this.mostrarForm.set(true);
  }

  protected editar(d: Deposito): void {
    this.editId.set(d.id);
    this.form.set({
      nombre: d.nombre,
      tipo: d.tipo,
      descripcion: d.descripcion,
      vehiculoPatente: normalizarPatente(d.vehiculoPatente),
      repartidorId: d.repartidorId,
    });
    this.tocado.set(false);
    this.mostrarForm.set(true);
  }

  protected cerrar(): void {
    this.mostrarForm.set(false);
    this.editId.set(null);
    this.form.set({ ...FORM_VACIO });
    this.tocado.set(false);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.tocado.set(true);
    const error = this.error();
    if (error) {
      this.toast.error(error);
      return;
    }
    const f = this.form();
    const esCamion = f.tipo === 'CAMION';
    const req: DepositoRequest = {
      nombre: limpiarTexto(f.nombre),
      tipo: f.tipo as TipoDeposito,
      descripcion: limpiarTexto(f.descripcion) || null,
      vehiculoPatente: esCamion ? normalizarPatente(f.vehiculoPatente) : null,
      repartidorId: esCamion ? f.repartidorId ?? null : null,
    };
    this.guardando.set(true);
    try {
      const id = this.editId();
      if (id) {
        await this.catalogo.editarDeposito(id, req);
        this.toast.exito('Depósito actualizado.');
      } else {
        await this.catalogo.crearDeposito(req);
        this.toast.exito('Depósito creado.');
      }
      this.cerrar();
    } catch (e: any) {
      this.toast.error(e.message || 'Error al guardar el depósito.');
    } finally {
      this.guardando.set(false);
    }
  }

  protected async toggleActivo(d: Deposito): Promise<void> {
    if (
      d.activo &&
      !confirm(`¿Desactivar "${d.nombre}"? No podrán registrarse movimientos de stock contra este depósito.`)
    ) {
      return;
    }
    try {
      await this.catalogo.cambiarEstadoDeposito(d.id, !d.activo);
      this.toast.exito(d.activo ? 'Depósito desactivado.' : 'Depósito activado.');
    } catch (e: any) {
      this.toast.error(e.message || 'No se pudo cambiar el estado.');
    }
  }
}
