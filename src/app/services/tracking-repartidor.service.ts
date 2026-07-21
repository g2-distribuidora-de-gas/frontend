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

type WatchPositionFn = (
  success: (pos: WatchPositionSample) => void,
  error?: (err: unknown) => void,
  options?: {
    enableHighAccuracy?: boolean;
    maximumAge?: number;
    timeout?: number;
  },
) => WatchHandle;

interface ClearWatchFn {
  (handle: WatchHandle): void;
}

interface TrackingNavigator {
  watchPosition: WatchPositionFn;
  clearWatch: ClearWatchFn;
}

interface VisibilityTracker {
  addEventListener(type: 'visibilitychange', cb: () => void): void;
  removeEventListener(type: 'visibilitychange', cb: () => void): void;
  readonly state: 'visible' | 'hidden' | 'prerender' | 'unloaded';
}

@Injectable({ providedIn: 'root' })
export class TrackingRepartidorService {
  private readonly realtime = inject(RealtimeService);

  private watch: WatchHandle | null = null;
  private rutaId: number | null = null;
  private visibilityCb: (() => void) | null = null;
  private ultimoOrigen: OrigenCoordenada = 'GPS';

  iniciar(rutaId: number): boolean {
    if (this.watch || this.rutaId === rutaId) return false;
    if (!this.navigatorDisponible()) return false;

    this.rutaId = rutaId;
    const nav = this.navegador();
    this.watch = nav.watchPosition(
      (sample) => this.manejarMuestra(sample),
      (err) => console.warn('[Tracking] geolocation error:', err),
      this.opcionesVigentes(),
    );

    if (typeof document !== 'undefined') {
      this.visibilityCb = () => this.rotarSegunVisibilidad();
      (document as unknown as VisibilityTracker).addEventListener(
        'visibilitychange',
        this.visibilityCb,
      );
    }
    return true;
  }

  async detener(): Promise<void> {
    if (this.watch) {
      this.navegador().clearWatch(this.watch);
      this.watch = null;
    }
    if (this.visibilityCb && typeof document !== 'undefined') {
      (document as unknown as VisibilityTracker).removeEventListener(
        'visibilitychange',
        this.visibilityCb,
      );
      this.visibilityCb = null;
    }
    this.rutaId = null;
  }

  estaActivo(): boolean {
    return this.watch !== null && this.rutaId !== null;
  }

  rutaActual(): number | null {
    return this.rutaId;
  }


  private opcionesVigentes(): {
    enableHighAccuracy: boolean;
    maximumAge: number;
    timeout: number;
  } {
    const visible =
      typeof document === 'undefined' ||
      (document as unknown as VisibilityTracker).state === 'visible';
    return {
      enableHighAccuracy: visible,
      maximumAge: visible ? 1000 : 5000,
      timeout: visible ? 5000 : 15000,
    };
  }

  private rotarSegunVisibilidad(): void {
    if (!this.rutaId || typeof navigator === 'undefined') return;
    if (this.watch) {
      this.navegador().clearWatch(this.watch);
    }
    this.watch = this.navegador().watchPosition(
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

  private navigatorDisponible(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.geolocation?.watchPosition === 'function'
    );
  }
}
