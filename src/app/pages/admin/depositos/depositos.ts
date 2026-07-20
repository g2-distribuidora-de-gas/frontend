import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogoService } from '../../../services/catalogo.service';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ToastService } from '../../../services/toast.service';
import {Deposito,DepositoRequest,TIPO_DEPOSITO_LABELS,TipoDeposito} from '../../../models/deposito.model';

interface RepartidorOpcion {
  id: number;
  nombre: string;
}

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

  protected mostrarForm = signal(false);
  protected editId = signal<string | null>(null);
  protected form = signal<{
    nombre: string;
    tipo: TipoDeposito | '';
    descripcion: string;
    vehiculoPatente: string;
    repartidorId: number | null;
  }>({ nombre: '', tipo: '', descripcion: '', vehiculoPatente: '', repartidorId: null });

  protected esCamion = computed(() => this.form().tipo === 'CAMION');

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

  protected campo(campo: 'nombre' | 'tipo' | 'descripcion' | 'vehiculoPatente' | 'repartidorId', valor: any): void {
    this.form.update((f) => ({ ...f, [campo]: valor }));
  }

  protected abrirNuevo(): void {
    this.editId.set(null);
    this.form.set({ nombre: '', tipo: '', descripcion: '', vehiculoPatente: '', repartidorId: null });
    this.mostrarForm.set(true);
  }

  protected editar(d: Deposito): void {
    this.editId.set(d.id);
    this.form.set({
      nombre: d.nombre,
      tipo: d.tipo,
      descripcion: d.descripcion,
      vehiculoPatente: d.vehiculoPatente,
      repartidorId: d.repartidorId,
    });
    this.mostrarForm.set(true);
  }

  protected cerrar(): void {
    this.mostrarForm.set(false);
    this.editId.set(null);
  }

  protected async guardar(): Promise<void> {
    const f = this.form();
    if (!f.nombre.trim()) {
      this.toast.error('Ingresá el nombre del depósito.');
      return;
    }
    if (!f.tipo) {
      this.toast.error('Seleccioná el tipo de depósito.');
      return;
    }
    const req: DepositoRequest = {
      nombre: f.nombre.trim(),
      tipo: f.tipo,
      descripcion: f.descripcion.trim() || null,
      vehiculoPatente: f.tipo === 'CAMION' ? f.vehiculoPatente.trim() || null : null,
      repartidorId: f.tipo === 'CAMION' ? f.repartidorId ?? null : null,
    };
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
    }
  }

  protected async toggleActivo(d: Deposito): Promise<void> {
    try {
      await this.catalogo.cambiarEstadoDeposito(d.id, !d.activo);
      this.toast.exito(d.activo ? 'Depósito desactivado.' : 'Depósito activado.');
    } catch (e: any) {
      this.toast.error(e.message || 'No se pudo cambiar el estado.');
    }
  }
}
