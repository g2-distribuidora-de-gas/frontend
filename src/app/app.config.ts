import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { baseUrlInterceptor } from './interceptors/base-url.interceptor';
import { apiResponseInterceptor } from './interceptors/api-response.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { RxDatabaseService } from './services/rx-database.service';
import { ReplicationService } from './services/replication.service';
import { RepartoOfflineService } from './services/reparto-offline.service';
import { AuthService } from './services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(

      withInterceptors([authInterceptor, baseUrlInterceptor, apiResponseInterceptor]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:100000',
    }),

    provideAppInitializer(async () => {
      const dbService = inject(RxDatabaseService);
      const replication = inject(ReplicationService);
      const repartoOffline = inject(RepartoOfflineService);
      const auth = inject(AuthService);

      await dbService.init();
      if (auth.autenticado() && auth.esPreventista()) {
        await replication.iniciar();
      }
      if (auth.autenticado() && auth.esRepartidor()) {
        const uid = auth.userId();
        if (uid != null) await repartoOffline.iniciar(uid);
      }
    }),
  ],
};
