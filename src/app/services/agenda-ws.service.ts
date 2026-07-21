import { Injectable, signal } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { AgendaNotificacion } from '../models/ruta.model';

/**
 * Servicio que mantiene una conexión STOMP activa hacia el backend
 * y escucha el canal personal /user/queue/agenda.
 *
 * Uso:
 *   agendaWs.conectar(jwt);          // al autenticar o montar la vista
 *   agendaWs.notificaciones();        // Signal<AgendaNotificacion[]>
 *   agendaWs.desconectar();           // al destruir la vista
 */
@Injectable({ providedIn: 'root' })
export class AgendaWsService {
  /** Notificaciones recibidas (la más reciente primero). */
  readonly notificaciones = signal<AgendaNotificacion[]>([]);

  private client: Client | null = null;

  /**
   * Inicia la conexión STOMP usando WebSocket nativo.
   * Si ya hay una conexión activa, la reutiliza.
   */
  conectar(token: string): void {
    if (this.client?.active) return;

    const wsUrl = this.buildWsUrl();

    this.client = new Client({
      brokerURL: wsUrl,
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 5000,
      onConnect: () => {
        this.client?.subscribe('/user/queue/agenda', (msg: IMessage) => {
          try {
            const notif = JSON.parse(msg.body) as AgendaNotificacion;
            this.notificaciones.update((prev) => [notif, ...prev]);
          } catch {
            // mensaje malformado — ignorar
          }
        });
      },
      onStompError: (frame) => {
        console.warn('[AgendaWs] STOMP error:', frame.headers['message']);
      },
    });

    this.client.activate();
  }

  /** Cierra la conexión STOMP y limpia el estado. */
  desconectar(): void {
    this.client?.deactivate();
    this.client = null;
  }

  /** Marca todas las notificaciones como leídas / las vacía. */
  limpiarNotificaciones(): void {
    this.notificaciones.set([]);
  }

  /**
   * Construye la URL WebSocket adaptando el protocolo HTTP/HTTPS
   * al correspondiente WS/WSS, apuntando al endpoint del backend.
   */
  private buildWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // En desarrollo el proxy de Angular redirige /ws → localhost:8080/ws
    return `${proto}//${window.location.host}/ws`;
  }
}
