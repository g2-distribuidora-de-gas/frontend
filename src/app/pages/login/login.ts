import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { ReplicationService } from '../../services/replication.service';
import { RepartoOfflineService } from '../../services/reparto-offline.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private replication = inject(ReplicationService);
  private repartoOffline = inject(RepartoOfflineService);
  private toast = inject(ToastService);

  protected email = signal('');
  protected password = signal('');
  protected verPassword = signal(false);
  protected cargando = signal(false);
  protected error = signal<string | null>(null);
  protected emailTocado = signal(false);

  /** El email debe contener "@" y terminar en ".com" */
  protected emailValido = computed(() =>
    /^[^\s@]+@[^\s@]+\.com$/i.test(this.email().trim()),
  );

  protected async iniciarSesion(): Promise<void> {
    if (this.cargando()) return;

    const email = this.email().trim();
    const password = this.password();

    if (!email || !password) {
      this.error.set('Ingresá tu email y contraseña.');
      return;
    }

    if (!this.emailValido()) {
      this.error.set('El email debe ser válido: contener "@" y ".com".');
      this.emailTocado.set(true);
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    try {
      const usuario = await this.auth.login({ email, password });
      if (this.auth.esPreventista()) {
        await this.replication.iniciar();
      }
      if (this.auth.esRepartidor()) {
        const uid = this.auth.userId();
        if (uid != null) await this.repartoOffline.iniciar(uid);
      }
      this.toast.mostrar(`¡Bienvenido, ${usuario.nombreCompleto}!`, 'exito');
      await this.router.navigateByUrl(this.auth.rutaInicial());
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private mensajeError(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return 'No se pudo conectar con el servidor. Verificá tu conexión.';
      }
      const msg = e.error?.mensaje;
      if (typeof msg === 'string') return msg;
      if (e.status === 401 || e.status === 403) return 'Email o contraseña incorrectos.';
    }
    return 'Ocurrió un error al iniciar sesión. Intentá de nuevo.';
  }
}