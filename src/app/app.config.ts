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
      const auth = inject(AuthService);

      await dbService.init();
      if (auth.autenticado() && auth.esPreventista()) {
        await replication.iniciar();
      }
    }),
  ],
};
