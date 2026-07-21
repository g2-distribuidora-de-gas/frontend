import { Injectable, inject } from '@angular/core';

import { RealtimeService } from './realtime.service';
import {
  OrigenCoordenada,
  PosicionRepartidorDto,
} from '../models/realtime.model';


interface WatchHandle {
  readonly id: number;
}

interface WatchPositionCoords {
  readonly latitude: number;
  readonly longitude: number;
  readonly heading: number | null;
  readonly speed: number | null;
  readonly accuracy: number | null;
}

interface WatchPositionSample {
  readonly coords: WatchPositionCoords;
  readonly timestamp: number;
}

interface WatchPositionOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

type WatchPositionFn = (
  success: (pos: WatchPositionSample) => void,
  error?: (err: GeolocationPositionError | { code: number; message: string }) => void,
  options?: WatchPositionOptions,
) => WatchHandle;

type GetCurrentPositionFn = (
  success: (pos: WatchPositionSample) => void,
  error?: (err: GeolocationPositionError | { code: number; message: string }) => void,
  options?: WatchPositionOptions,
) => void;

interface TrackingNavigator {
  readonly geolocation?: {
    watchPosition: WatchPositionFn;
    getCurrentPosition: GetCurrentPositionFn;
    clearWatch: ClearWatchFn;
  };
}

interface ClearWatchFn {
  (handle: WatchHandle): void;
}

export type EstadoTracking =
  | 'ok'
  | 'no-soportado'
  | 'no-secure-context'
  | 'sin-permisos-navegador'
  | 'permiso-denegado'
  | 'posicion-no-disponible'
  | 'timeout';

export interface TrackingStartResult {
  readonly estado: EstadoTracking;
  readonly mensaje: string;
  readonly permiso?: 'granted' | 'denied' | 'prompt' | 'unknown';
}

@Injectable({ providedIn: 'root' })
export class TrackingRepartidorService {
  private readonly realtime = inject(RealtimeService);

  private watch: WatchHandle | null = null;
  private rutaId: number | null = null;
  private visibilityCb: (() => void) | null = null;
  private ultimoOrigen: OrigenCoordenada = 'GPS';

  async iniciar(rutaId: number): Promise<TrackingStartResult> {
    if (this.watch || this.rutaId === rutaId) {
      return {
        estado: 'ok',
        mensaje: 'El tracking ya estaba activo para esta ruta.',
      };
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return {
        estado: 'no-soportado',
        mensaje: 'Tu navegador no expone la API de geolocalización.',
      };
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return {
        estado: 'no-secure-context',
        mensaje:
          'La geolocalización requiere HTTPS o un origen localhost. Probá abrir la app en http://localhost:4200/.',
      };
    }

    const precheck = await this.prechequearPermiso();
    if (precheck === 'denied') {
      return {
        estado: 'sin-permisos-navegador',
        permiso: 'denied',
        mensaje:
          'El permiso de ubicación ya fue bloqueado en este navegador. Habilitalo desde el candado de la barra de direcciones y volvé a intentar.',
      };
    }

    try {
      await this.tomarMuestraInicial(rutaId);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 1) {
        return {
          estado: 'permiso-denegado',
          permiso: 'denied',
          mensaje:
            'Rechazaste el permiso de ubicación. Habilitalo para que el panel admin vea tu recorrido.',
        };
      }
      if (code === 2) {
        return {
          estado: 'posicion-no-disponible',
          mensaje:
            'No se pudo obtener una posición GPS. Verificá que el GPS esté encendido y que tengas señal.',
        };
      }
      if (code === 3) {
        return {
          estado: 'timeout',
          permiso: precheck ?? undefined,
          mensaje:
            'El navegador tardó demasiado en obtener una posición. Reintentá en unos segundos.',
        };
      }
      return {
        estado: 'posicion-no-disponible',
        mensaje: `Error desconocido del GPS: ${(err as { message?: string }).message ?? '?'}`,
      };
    }

    this.rutaId = rutaId;
    const nav = this.navegador();
    this.watch = nav.geolocation!.watchPosition(
      (sample) => this.manejarMuestra(sample),
      (err) => console.warn('[Tracking] geolocation error:', err),
      this.opcionesVigentes(),
    );

    if (typeof document !== 'undefined') {
      this.visibilityCb = () => this.rotarSegunVisibilidad();
      document.addEventListener('visibilitychange', this.visibilityCb);
    }

    return {
      estado: 'ok',
      permiso: precheck ?? 'granted',
      mensaje: 'Tracking GPS iniciado.',
    };
  }

  async detener(): Promise<void> {
    if (this.watch && typeof navigator !== 'undefined') {
      this.navegador().geolocation?.clearWatch(this.watch);
    }
    if (this.visibilityCb && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityCb);
    }
    this.visibilityCb = null;
    this.watch = null;
    this.rutaId = null;
  }

  estaActivo(): boolean {
    return this.watch !== null && this.rutaId !== null;
  }

  rutaActual(): number | null {
    return this.rutaId;
  }


  async consultarPermiso(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    return this.prechequearPermiso();
  }

  private async prechequearPermiso(): Promise<
    'granted' | 'denied' | 'prompt' | 'unknown'
  > {
    if (
      typeof navigator === 'undefined' ||
      !('permissions' in navigator) ||
      typeof (navigator as Navigator & { permissions: Permissions }).permissions.query !== 'function'
    ) {
      return 'unknown';
    }
    try {
      const estado = await (
        navigator as Navigator & { permissions: Permissions }
      ).permissions.query({ name: 'geolocation' as PermissionName });
      return estado.state as 'granted' | 'denied' | 'prompt';
    } catch {
      return 'unknown';
    }
  }

  private tomarMuestraInicial(_rutaId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const nav = this.navegador();
      if (!nav.geolocation) {
        reject({ code: 2, message: 'Geolocation API no disponible.' });
        return;
      }
      nav.geolocation.getCurrentPosition(
        () => resolve(),
        (err) => reject(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    });
  }

  private opcionesVigentes(): WatchPositionOptions {
    const visible =
      typeof document === 'undefined' ||
      document.visibilityState === 'visible';
    return {
      enableHighAccuracy: visible,
      maximumAge: visible ? 1000 : 5000,
      timeout: visible ? 5000 : 15000,
    };
  }

  private rotarSegunVisibilidad(): void {
    if (!this.rutaId || typeof navigator === 'undefined') return;
    const nav = this.navegador();
    if (!nav.geolocation || !this.watch) return;
    nav.geolocation.clearWatch(this.watch);
    this.watch = nav.geolocation.watchPosition(
      (sample) => this.manejarMuestra(sample),
      (err) => console.warn('[Tracking] geolocation error:', err),
      this.opcionesVigentes(),
    );
  }

  private manejarMuestra(sample: WatchPositionSample): void {
    if (!this.rutaId) return;
    const origen = this.ultimoOrigen;
    const pos: PosicionRepartidorDto = {
      latitud: sample.coords.latitude,
      longitud: sample.coords.longitude,
      headingGrados:
        sample.coords.heading != null ? sample.coords.heading : null,
      velocidadMps: sample.coords.speed != null ? sample.coords.speed : null,
      precisionM:
        sample.coords.accuracy != null ? sample.coords.accuracy : null,
      timestampCliente: new Date(sample.timestamp).toISOString(),
      origen,
    };

    if (!this.realtime.publicarPosicion(this.rutaId, pos)) {
      return;
    }

    if (sample.coords.heading == null && sample.coords.speed == null) {
      this.ultimoOrigen = 'NETWORK';
    } else {
      this.ultimoOrigen = 'GPS';
    }
  }

  private navegador(): TrackingNavigator {
    if (typeof navigator === 'undefined') {
      throw new Error('[Tracking] navigator no disponible.');
    }
    return navigator as unknown as TrackingNavigator;
  }
}
