import { TestBed } from '@angular/core/testing';
import { StompSubscription } from '@stomp/stompjs';
import { firstValueFrom, take, toArray } from 'rxjs';
import { vi } from 'vitest';

import {
  EventoRutaWsDto,
  PosicionBroadcastDto,
  PosicionRepartidorDto,
  appPosicion,
  topicEventos,
  topicPosiciones,
} from '../models/realtime.model';
import {
  RealtimeService,
  STOMP_CLIENT_FACTORY,
  STOMP_WEBSOCKET_FACTORY,
  StompClientLike,
  StompWebSocketFactory,
} from './realtime.service';


interface SuscripcionStub {
  unsubscribe: ReturnType<typeof vi.fn>;
  id?: string;
}

class ClienteStub implements StompClientLike {
  active = false;
  onConnect: ((frame: unknown) => void) | null = null;
  onDisconnect: ((frame: unknown) => void) | null = null;
  onWebSocketClose: ((event: unknown) => void) | null = null;
  onStompError: ((frame: { headers?: Record<string, string>; body?: string }) => void) | null = null;
  onWebSocketError: ((event: unknown) => void) | null = null;

  activate = vi.fn(() => {
    this.active = true;
  });
  deactivate = vi.fn(async () => {
    this.active = false;
  });
  publish = vi.fn();

  private destinos = new Map<string, Array<(msg: { body: string }) => void>>();

  subscribe(
    destination: string,
    cb: (msg: { body: string }) => void,
  ): StompSubscription {
    const stub: SuscripcionStub = {
      unsubscribe: vi.fn(() => {
        const lista = this.destinos.get(destination);
        if (lista) {
          const idx = lista.indexOf(cb);
          if (idx >= 0) lista.splice(idx, 1);
        }
      }),
      id: destination,
    };
    const lista = this.destinos.get(destination) ?? [];
    lista.push(cb);
    this.destinos.set(destination, lista);
    return stub as unknown as StompSubscription;
  }

  simularOnConnect(): void {
    this.onConnect?.({});
  }

  emitir(destination: string, body: unknown): void {
    const lista = this.destinos.get(destination) ?? [];
    const payload =
      typeof body === 'string' ? body : JSON.stringify(body);
    const msg: { body: string } = { body: payload };
    for (const cb of lista) cb(msg);
  }

  suscriptoresEn(destination: string): number {
    return (this.destinos.get(destination) ?? []).length;
  }
}

function provideClienteStub(): {
  instanciado: () => ClienteStub;
} {
  const instancias: ClienteStub[] = [];
  const factory = () => {
    const c = new ClienteStub();
    instancias.push(c);
    return c;
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: STOMP_WEBSOCKET_FACTORY,
        useValue: (() => null) as StompWebSocketFactory,
      },
      {
        provide: STOMP_CLIENT_FACTORY,
        useValue: factory,
      },
    ],
  });
  return { instanciado: () => instancias.at(-1) as ClienteStub };
}

describe('RealtimeService', () => {
  let service: RealtimeService;
  let instancia: { instanciado: () => ClienteStub };

  beforeEach(() => {
    instancia = provideClienteStub();
    service = TestBed.inject(RealtimeService);
  });

  function conectar(jwt = 'token-test'): ClienteStub {
    service.conectar(jwt);
    const c = instancia.instanciado();
    expect(c.activate).toHaveBeenCalled();
    return c;
  }

  it('crea el cliente y llama activate al conectar', () => {
    const c = conectar();
    expect(c.activate).toHaveBeenCalledTimes(1);
  });

  it('conectar() sin token no hace nada', () => {
    service.conectar('');
    expect(instancia.instanciado()).toBeUndefined();
  });

  it('emite conectado$ = true cuando llega onConnect', async () => {
    const c = conectar();
    const seq = firstValueFrom(
      service.conectado$.pipe(take(2), toArray()),
    );
    c.simularOnConnect();
    const values = await seq;
    expect(values).toEqual([false, true]);
    expect(service.estaConectado()).toBe(true);
  });

  it('emite conectado$ = false en onDisconnect / onWebSocketClose', async () => {
    const c = conectar();
    c.simularOnConnect();
    const seq = firstValueFrom(
      service.conectado$.pipe(take(3), toArray()),
    );
    c.onDisconnect?.({});
    c.onWebSocketClose?.({});
    const values = await seq;
    expect(values).toContain(false);
    expect(values.at(-1)).toBe(false);
  });

  it('suscripciones a posiciones funcionan tras onConnect', () => {
    const c = conectar();
    const cb = vi.fn();
    service.suscribirseAPosiciones(42, cb);
    c.simularOnConnect();
    c.emitir(topicPosiciones(42), { rutaId: 42, serverTimestamp: '2026-07-20T13:45:00Z' });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ rutaId: 42 }));
  });

  it('suscripciones a eventos consumen EventoRutaWsDto del topic', () => {
    const c = conectar();
    const cb = vi.fn();
    service.suscribirseAEventos(7, cb);
    c.simularOnConnect();
    c.emitir(
      topicEventos(7),
      {
        tipo: 'CAMBIO_ESTADO_RUTA',
        rutaId: 7,
        estadoNuevo: 'EN_CURSO',
        timestamp: '2026-07-20T13:45:00Z',
      } satisfies EventoRutaWsDto,
    );
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ rutaId: 7, estadoNuevo: 'EN_CURSO' }),
    );
  });

  it('suscripcion a errores parsea payload y emite por errores$', async () => {
    const c = conectar();
    const cb = vi.fn();
    service.suscribirseAErrores(cb);
    c.simularOnConnect();
    const seq = firstValueFrom(service.errores$.pipe(take(1)));
    c.emitir('/user/queue/errors', {
      codigo: 'LATITUD_INVALIDA',
      mensaje: 'fuera de rango',
      timestamp: '2026-07-20T13:45:00Z',
    });
    const err = await seq;
    expect(err.codigo).toBe('LATITUD_INVALIDA');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LATITUD_INVALIDA' }));
  });

  it('publicarPosicion respeta el throttle de 1 msg/s por ruta', () => {
    const c = conectar();
    c.simularOnConnect();
    const pos: PosicionRepartidorDto = {
      latitud: -26.2,
      longitud: -58.2,
      timestampCliente: '2026-07-20T13:45:00Z',
      origen: 'GPS',
    };

    expect(service.publicarPosicion(3, pos)).toBe(true);
    expect(c.publish).toHaveBeenCalledTimes(1);
    expect(c.publish).toHaveBeenCalledWith({
      destination: appPosicion(3),
      body: expect.stringContaining('"rutaId":3'),
    });

    expect(service.publicarPosicion(3, pos)).toBe(false);
    expect(c.publish).toHaveBeenCalledTimes(1);

    expect(service.publicarPosicion(99, pos)).toBe(true);
    expect(c.publish).toHaveBeenCalledTimes(2);
  });

  it('publicarPosicion no envía si el cliente no está activo', () => {
    service.conectar('token-test');
    const c = instancia.instanciado();
    c.active = false;
    expect(service.publicarPosicion(1, { latitud: 0, longitud: 0 })).toBe(
      false,
    );
    expect(c.publish).not.toHaveBeenCalled();
  });

  it('desconectar desuscribe y desactiva el cliente', async () => {
    const c = conectar();
    c.simularOnConnect();
    const sub = service.suscribirseAPosiciones(10, () => undefined);
    await service.desconectar();
    expect(sub?.unsubscribe).toHaveBeenCalled();
    expect(c.deactivate).toHaveBeenCalled();
    expect(service.estaConectado()).toBe(false);
  });

  it('conectar no recrea el cliente si ya está activo con el mismo token', () => {
    const c = conectar('mismo-token');
    c.simularOnConnect();
    const antesDeLlamar = c;
    service.conectar('mismo-token');
    expect(instancia.instanciado()).toBe(antesDeLlamar);
    expect(c.activate).toHaveBeenCalledTimes(1);
  });

  it('parsea una PosicionBroadcastDto entrante', () => {
    const c = conectar();
    const cb = vi.fn();
    service.suscribirseAPosiciones(1, cb);
    c.simularOnConnect();
    const dto: PosicionBroadcastDto = {
      rutaId: 1,
      repartidorId: 5,
      repartidorNombre: 'Juan Perez',
      estadoRuta: 'EN_CURSO',
      latitud: -26.21,
      longitud: -58.21,
      serverTimestamp: '2026-07-20T13:45:00Z',
    };
    c.emitir(topicPosiciones(1), dto);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ rutaId: 1 }));
  });
});
