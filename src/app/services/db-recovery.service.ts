import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RxDatabaseService } from './rx-database.service';
import { ReplicationService } from './replication.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';


@Injectable({ providedIn: 'root' })
export class DbRecoveryService {
  private rxDb = inject(RxDatabaseService);
  private replication = inject(ReplicationService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  private recuperando = false;

  async manejarDbCerrada(): Promise<void> {
    if (this.recuperando) return;
    this.recuperando = true;

    try {
      await this.replication.cancelar();
    } catch (e) {
      console.warn('[DbRecovery] No se pudo cancelar la replicación', e);
    }

    try {
      await this.rxDb.reinicializar();
    } catch (e) {
      console.error('[DbRecovery] Error al reinicializar RxDB', e);
    }

    this.auth.logout();
    await this.router.navigate(['/login']);
    this.toast.mostrar(
      'Tu sesión se cerró porque se limpió el almacenamiento local. Iniciá sesión de nuevo.',
      'info',
    );

    this.recuperando = false;
  }
}
