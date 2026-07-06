import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastService } from './services/toast.service';
import { ReplicationService } from './services/replication.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly online = signal(navigator.onLine);
  protected readonly toast = inject(ToastService);
  private readonly replication = inject(ReplicationService);

  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      // Re-sincronizar cuando vuelve la conexión
      this.replication.resincronizar();
    });
    window.addEventListener('offline', () => this.online.set(false));
  }
}
