import { Client, IMessage } from '@stomp/stompjs';

import { StompClientLike, StompWebSocketFactory } from './realtime.service';


export const defaultStompWebSocketFactory: StompWebSocketFactory = () => null;


export function defaultStompClientFactory(config: {
  wsSocket: StompWebSocketFactory;
}): StompClientLike {
  const inner = new Client({
    webSocketFactory: () =>
      config.wsSocket() as unknown as WebSocket,
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: () => undefined,
  });

  const wrapper: StompClientLike = {
    get active() {
      return inner.active;
    },
    onConnect: null,
    onDisconnect: null,
    onWebSocketClose: null,
    onStompError: null,
    onWebSocketError: null,
    activate: () => {
      inner.activate();
    },
    deactivate: () => inner.deactivate(),
    subscribe: (destination, cb) =>
      inner.subscribe(
        destination,
        cb as unknown as (msg: IMessage) => void,
      ),
    publish: (params) =>
      inner.publish({
        destination: params.destination,
        body: params.body,
        headers: params.headers as never,
      }),
  };

  inner.onConnect = (frame) => wrapper.onConnect?.(frame);
  inner.onDisconnect = (frame) => wrapper.onDisconnect?.(frame);
  inner.onWebSocketClose = (event) => wrapper.onWebSocketClose?.(event);
  inner.onStompError = (frame) =>
    wrapper.onStompError?.(frame as unknown as { headers?: Record<string, string>; body?: string });
  inner.onWebSocketError = (event) => wrapper.onWebSocketError?.(event);

  return wrapper;
}
