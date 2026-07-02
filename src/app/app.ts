import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastService } from './services/toast.service';
import { SyncService } from './services/sync.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly online = signal(navigator.onLine);
  protected readonly toast = inject(ToastService);
  private readonly syncService = inject(SyncService);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));

    // Iniciar auto-sincronización cuando vuelve la conexión
    this.syncService.iniciarAutoSync();
  }
}
