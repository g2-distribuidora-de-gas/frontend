import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { baseUrlInterceptor } from './interceptors/base-url.interceptor';
import { apiResponseInterceptor } from './interceptors/api-response.interceptor';
import { RxDatabaseService } from './services/rx-database.service';
import { ReplicationService } from './services/replication.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([baseUrlInterceptor, apiResponseInterceptor]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:100000',
    }),

    // Inicializar RxDB antes de que arranque la app
    provideAppInitializer(async () => {
      const dbService = inject(RxDatabaseService);
      const replication = inject(ReplicationService);
      
      await dbService.init();
      // Iniciar replicación después de la DB
      await replication.iniciar();
    }),
  ],
};
