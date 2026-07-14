import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ToastService } from '../../../services/toast.service';
import { UsuarioResponse } from '../../../models/usuario.model';
import { RolUsuario } from '../../../models/auth.model';

interface FormUsuario {
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  direccion: string;
  email: string;
  password: string;
  rol: RolUsuario | '';
}

const FORM_VACIO: FormUsuario = {
  nombre: '',
  apellido: '',
  dni: '',
  telefono: '',
  direccion: '',
  email: '',
  password: '',
  rol: '',
};

@Component({
  selector: 'app-admin-usuarios',
  imports: [FormsModule],
  templateUrl: './usuarios.html',
})
export class Usuarios {
  private api = inject(ApiUsuarioService);
  private toast = inject(ToastService);
  protected auth = inject(AuthService);

  protected usuarios = signal<UsuarioResponse[]>([]);
  protected cargando = signal(true);
  protected guardando = signal(false);
  protected mostrarForm = signal(false);
  protected verPassword = signal(false);
  protected form = signal<FormUsuario>({ ...FORM_VACIO });
  protected filtroRol = signal<string>('todos');
  protected busqueda = signal('');

  protected rolesDisponibles = computed<RolUsuario[]>(() => {
    const base: RolUsuario[] = ['PREVENTISTA', 'REPARTIDOR'];
    return this.auth.esSuperAdmin() ? [...base, 'ADMIN'] : base;
  });

  protected readonly ROL_LABELS: Record<RolUsuario, string> = {
    PREVENTISTA: 'Preventista',
    REPARTIDOR: 'Repartidor',
    ADMIN: 'Administrador',
    SUPER_ADMIN: 'Super admin',
  };

  protected filtrados = computed(() => {
    const rol = this.filtroRol();
    const q = this.busqueda().toLowerCase().trim();
    return this.usuarios().filter((u) => {
      if (rol !== 'todos' && u.rol !== rol) return false;
      if (!q) return true;
      return `${u.nombreCompleto} ${u.dni} ${u.email} ${u.rol}`.toLowerCase().includes(q);
    });
  });

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const lista = await this.api.listarTodos();
      this.usuarios.set(lista);
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudieron cargar los usuarios.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected abrirForm(): void {
    this.form.set({ ...FORM_VACIO });
    this.mostrarForm.set(true);
  }

  protected cerrarForm(): void {
    this.mostrarForm.set(false);
    this.form.set({ ...FORM_VACIO });
  }

  protected campo<K extends keyof FormUsuario>(campo: K, valor: string): void {
    let v = valor;
    if (campo === 'nombre' || campo === 'apellido') v = v.replace(/\d/g, '');
    if (campo === 'dni') v = v.replace(/\D/g, '').slice(0, 10);
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
    if (!/^\d{7,10}$/.test(f.dni.trim())) return 'El DNI debe tener entre 7 y 10 dígitos.';
    if (f.telefono.trim() && !/^\d{8,10}$/.test(f.telefono.trim()))
      return 'El teléfono debe tener entre 8 y 10 dígitos.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'El email no tiene un formato válido.';
    if (f.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (!f.rol) return 'Seleccioná un rol.';
    if (!this.rolesDisponibles().includes(f.rol))
      return 'No tenés permiso para crear ese rol.';
    return null;
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    const error = this.validar();
    if (error) {
      this.toast.error(error);
      return;
    }
    const f = this.form();
    this.guardando.set(true);
    try {
      await this.api.registrar({
        nombre: f.nombre.trim(),
        apellido: f.apellido.trim(),
        dni: f.dni.trim(),
        telefono: f.telefono.trim() || undefined,
        direccion: f.direccion.trim() || undefined,
        email: f.email.trim(),
        password: f.password,
        rol: f.rol as RolUsuario,
      });
      this.toast.exito('Usuario creado correctamente.');
      this.cerrarForm();
      await this.cargar();
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo crear el usuario.'));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Un admin no puede desactivar su propia cuenta ni la de otros administradores. */
  protected puedeDesactivar(u: UsuarioResponse): boolean {
    if (u.rol === 'SUPER_ADMIN') return false;
    if (u.id === this.auth.userId()) return false;
    if (u.rol === 'ADMIN' && !this.auth.esSuperAdmin()) return false;
    return true;
  }

  protected async desactivar(u: UsuarioResponse): Promise<void> {
    if (u.rol === 'SUPER_ADMIN') {
      this.toast.error('No se puede desactivar a un super admin.');
      return;
    }
    if (u.id === this.auth.userId()) {
      this.toast.error('No podés desactivar tu propia cuenta.');
      return;
    }
    if (u.rol === 'ADMIN' && !this.auth.esSuperAdmin()) {
      this.toast.error('No se puede desactivar a otro administrador.');
      return;
    }
    if (!confirm(`¿Desactivar a ${u.nombreCompleto}? Podrás reactivarlo luego.`)) return;
    try {
      await this.api.eliminar(u.id);
      this.toast.exito('Usuario desactivado.');
      await this.cargar();
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo desactivar el usuario.'));
    }
  }

  protected async reactivar(u: UsuarioResponse): Promise<void> {
    try {
      await this.api.reactivar(u.id);
      this.toast.exito('Usuario reactivado.');
      await this.cargar();
    } catch (e) {
      this.toast.error(this.msgError(e, 'No se pudo reactivar el usuario.'));
    }
  }

  protected claseRol(rol: RolUsuario): string {
    switch (rol) {
      case 'PREVENTISTA': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'REPARTIDOR': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'ADMIN': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'SUPER_ADMIN': return 'bg-brand-100 text-brand-800 border-brand-300';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  }

  private msgError(e: unknown, fallback: string): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.mensaje;
      if (typeof msg === 'string') return msg;
      if (e.status === 0) return 'No se pudo conectar con el servidor.';
    }
    if (e instanceof Error && e.message) return e.message;
    return fallback;
  }
}