import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), //registra listeners globales de errores del navegador
    provideRouter(routes), //activa el router con las rutas definidas
    provideServiceWorker('ngsw-worker.js', { // registra el service worker de la PWA
      enabled: !isDevMode(),//olo se registra en producción, n desarrollo (ng serve) queda desactivado, 
      //porque un SW cacheando archivos mientras editás código te mostraría versiones viejas todo el tiempo.
      registrationStrategy: 'registerWhenStable:30000', //espera a que la app esté "estable" (terminó de arrancar, sin tareas pendientes) o como máximo 30 segundos
    }),
  ],
};
