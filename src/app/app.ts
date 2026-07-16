import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToastService } from './services/toast.service';
import { ReplicationService } from './services/replication.service';
import { RepartoOfflineService } from './services/reparto-offline.service';
import { AuthService } from './services/auth.service';

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
  private readonly router = inject(Router);

  protected readonly enLogin = signal(this.router.url.startsWith('/login'));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.enLogin.set(e.urlAfterRedirects.startsWith('/login')));

    window.addEventListener('online', () => {
      this.online.set(true);
      if (this.auth.esPreventista()) {
        this.replication.resincronizar();
      }
      if (this.auth.esRepartidor()) {
        void this.repartoOffline.flush();
      }
    });
    window.addEventListener('offline', () => this.online.set(false));
  }

  protected async cerrarSesion(): Promise<void> {

    await this.replication.cancelar();
    await this.repartoOffline.cancelar();
    this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
