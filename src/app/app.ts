import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ToastService } from './services/toast.service';
import { ReplicationService } from './services/replication.service';
import { RepartoOfflineService } from './services/reparto-offline.service';
import { AuthService } from './services/auth.service';
import { RealtimeService } from './services/realtime.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
})
export class App {
  protected readonly online = signal(navigator.onLine);
  protected readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  private readonly replication = inject(ReplicationService);
  private readonly repartoOffline = inject(RepartoOfflineService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  protected readonly stomp = signal(this.realtime.estaConectado());

  private subConexion?: Subscription;

  protected readonly enLogin = signal(this.router.url.startsWith('/login'));
  protected readonly menuAbierto = signal(false);
  protected toggleMenu(): void {
    this.menuAbierto.update((v) => !v);
  }
  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.enLogin.set(e.urlAfterRedirects.startsWith('/login'));
        this.menuAbierto.set(false);
      });

    this.subConexion = this.realtime.conectado$.subscribe((v) =>
      this.stomp.set(v),
    );

    window.addEventListener('online', () => {
      this.online.set(true);
      if ((this.auth.esPreventista() || this.auth.esAdministrativo())) {
        this.replication.resincronizar();
      }
      if (this.auth.esRepartidor()) {
        void this.repartoOffline.flush();
      }
      const token = this.auth.token;
      if (token) this.realtime.conectar(token);
    });
    window.addEventListener('offline', () => {
      this.online.set(false);
      void this.realtime.desconectar();
    });
  }

  protected async cerrarSesion(): Promise<void> {
    void this.realtime.desconectar();
    await this.replication.cancelar();
    await this.repartoOffline.cancelar();
    this.subConexion?.unsubscribe();
    this.auth.logout();
    await this.router.navigate(['/login']);
  }
}