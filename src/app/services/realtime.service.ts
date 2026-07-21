import { Injectable, NgZone, inject } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { BehaviorSubject, Subject } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ErrorWsDto,
  EventoRutaWsDto,
  PosicionBroadcastDto,
  PosicionRepartidorDto,
  USER_QUEUE_ERRORS_DESTINATION,
  appPosicion,
  topicEventos,
  topicPosiciones,
} from '../models/realtime.model';


type SubscriptionKind = 'posiciones' | 'eventos' | 'errores';

interface SuscripcionRegistrada {
  kind: SubscriptionKind;
  rutaId?: number;
  callbacks: Array<(payload: unknown) => void>;
}

const POSICION_THROTTLE_MS = 1000;

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly zone = inject(NgZone);

  readonly conectado$ = new BehaviorSubject<boolean>(false);
  readonly errores$ = new Subject<ErrorWsDto>();

  private client?: Client;
  private readonly subs = new Map<string, StompSubscription>();
  private readonly pendientes = new Map<string, SuscripcionRegistrada>();
  private readonly ultimoEnvioPorRuta = new Map<number, number>();

  private tokenActual: string | null = null;
  private activo = false;


  conectar(jwt: string): void {
    const token = (jwt ?? '').trim();
    if (!token) {
      console.warn('[RealtimeService] conectar() requiere un JWT no vacío.');
      return;
    }

    if (this.client && this.tokenActual === token && this.activo) {
      return;
    }

    if (this.client) {
      void this.limpiarCliente();
    }

    this.tokenActual = token;
    const wsBase = environment.wsUrl;
    const wsUrlConToken = `${wsBase}?token=${encodeURIComponent(token)}`;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(wsUrlConToken) as unknown as WebSocket,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => undefined,
    });

    client.onConnect = () => {
      this.zone.run(() => this.alConectar());
    };
    client.onDisconnect = () => {
      this.zone.run(() => this.conectado$.next(false));
    };
    client.onWebSocketClose = () => {
      this.zone.run(() => this.conectado$.next(false));
    };
    client.onStompError = (frame) => {
      console.warn(
        '[RealtimeService] STOMP error:',
        frame.headers?.['message'] ?? frame.body,
      );
    };
    client.onWebSocketError = (event) => {
      console.warn('[RealtimeService] WebSocket error:', event);
    };

    this.client = client;
    this.activo = true;
    client.activate();
  }


  async desconectar(): Promise<void> {
    this.activo = false;
    await this.limpiarCliente();
    this.tokenActual = null;
    this.ultimoEnvioPorRuta.clear();
  }

  private async limpiarCliente(): Promise<void> {
    if (!this.client) return;
    for (const sub of this.subs.values()) {
      try {
        sub.unsubscribe();
      } catch {
      }
    }
    this.subs.clear();
    try {
      await this.client.deactivate();
    } catch {
    }
    this.client = undefined;
    this.conectado$.next(false);
  }

  private alConectar(): void {
    this.conectado$.next(true);

    for (const [key, entry] of this.pendientes) {
      const sub = this.crearSuscripcion(entry);
      if (sub) this.subs.set(key, sub);
    }
  }

  private crearSuscripcion(
    entry: SuscripcionRegistrada,
  ): StompSubscription | null {
    const client = this.client;
    if (!client?.active) return null;

    const dispatch = (msg: IMessage) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.body);
      } catch (e) {
        console.warn('[RealtimeService] payload inválido:', msg.body, e);
        return;
      }
      for (const cb of entry.callbacks) cb(parsed);
    };

    if (entry.kind === 'posiciones' && entry.rutaId != null) {
      return client.subscribe(topicPosiciones(entry.rutaId), dispatch);
    }
    if (entry.kind === 'eventos' && entry.rutaId != null) {
      return client.subscribe(topicEventos(entry.rutaId), dispatch);
    }
    if (entry.kind === 'errores') {
      return client.subscribe(USER_QUEUE_ERRORS_DESTINATION, dispatch);
    }
    return null;
  }


  suscribirseAPosiciones(
    rutaId: number,
    cb: (pos: PosicionBroadcastDto) => void,
  ): StompSubscription | null {
    const key = `pos:${rutaId}`;
    const entry: SuscripcionRegistrada = this.pendientes.get(key) ?? {
      kind: 'posiciones',
      rutaId,
      callbacks: [],
    };
    const wrapped = (p: unknown) => cb(p as PosicionBroadcastDto);
    entry.callbacks.push(wrapped);
    this.pendientes.set(key, entry);

    const existente = this.subs.get(key);
    if (existente) return existente;

    const sub = this.crearSuscripcion(entry);
    if (sub) this.subs.set(key, sub);
    return sub;
  }


  suscribirseAEventos(
    rutaId: number,
    cb: (evt: EventoRutaWsDto) => void,
  ): StompSubscription | null {
    const key = `evt:${rutaId}`;
    const entry: SuscripcionRegistrada = this.pendientes.get(key) ?? {
      kind: 'eventos',
      rutaId,
      callbacks: [],
    };
    const wrapped = (p: unknown) => cb(p as EventoRutaWsDto);
    entry.callbacks.push(wrapped);
    this.pendientes.set(key, entry);

    const existente = this.subs.get(key);
    if (existente) return existente;

    const sub = this.crearSuscripcion(entry);
    if (sub) this.subs.set(key, sub);
    return sub;
  }


  suscribirseAErrores(cb: (e: ErrorWsDto) => void): StompSubscription | null {
    const key = 'err:user';
    const entry: SuscripcionRegistrada = this.pendientes.get(key) ?? {
      kind: 'errores',
      callbacks: [],
    };
    const wrapped = (p: unknown) => {
      const dto = p as ErrorWsDto;
      this.errores$.next(dto);
      cb(dto);
    };
    entry.callbacks.push(wrapped);
    this.pendientes.set(key, entry);

    const existente = this.subs.get(key);
    if (existente) return existente;

    const sub = this.crearSuscripcion(entry);
    if (sub) this.subs.set(key, sub);
    return sub;
  }


  publicarPosicion(rutaId: number, pos: PosicionRepartidorDto): boolean {
    if (!this.client?.active) return false;

    const ahora = Date.now();
    const last = this.ultimoEnvioPorRuta.get(rutaId) ?? 0;
    if (ahora - last < POSICION_THROTTLE_MS) return false;
    this.ultimoEnvioPorRuta.set(rutaId, ahora);

    const payload: PosicionRepartidorDto = { ...pos, rutaId };
    try {
      this.client.publish({
        destination: appPosicion(rutaId),
        body: JSON.stringify(payload),
      });
      return true;
    } catch (e) {
      console.warn('[RealtimeService] no se pudo publicar posición:', e);
      this.ultimoEnvioPorRuta.set(rutaId, last);
      return false;
    }
  }


  estaConectado(): boolean {
    return this.client?.active === true;
  }
}
