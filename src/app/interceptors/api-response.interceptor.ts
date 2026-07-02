import { HttpInterceptorFn } from '@angular/common/http';
import { map } from 'rxjs';

/**
 * Interceptor que desenvuelve la respuesta del backend.
 * El backend envuelve todo en: { exito, mensaje, data, timestamp }
 * Este interceptor extrae solo el campo `data` para simplificar el consumo.
 */
export const apiResponseInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map((event: any) => {
      // Solo procesar HttpResponse con body
      if (event?.body && typeof event.body === 'object' && 'exito' in event.body) {
        const apiResponse = event.body;
        if (!apiResponse.exito) {
          throw new Error(apiResponse.mensaje ?? 'Error desconocido del servidor');
        }
        return event.clone({ body: apiResponse.data });
      }
      return event;
    }),
  );
};
