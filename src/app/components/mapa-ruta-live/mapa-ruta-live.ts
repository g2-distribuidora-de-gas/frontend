import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { StompSubscription } from '@stomp/stompjs';

import { RutaPedidoResponse } from '../../models/ruta.model';
import {
  ErrorWsDto,
  EventoRutaWsDto,
  PosicionBroadcastDto,
} from '../../models/realtime.model';
import { RealtimeService } from '../../services/realtime.service';


const MAX_EDAD_SEGUNDOS_ACEPTABLE = 30;

@Component({
  selector: 'app-mapa-ruta-live',
  imports: [CommonModule],
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      .leaflet-tooltip.mapa-ruta-live-tooltip {
        white-space: normal;
        width: max-content;
        max-width: 220px;
        padding: 6px 8px;
        border-radius: 8px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
      }
      .mapa-ruta-live-info {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 401;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-width: 14rem;
      }
      .mapa-ruta-live-info > .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.55rem;
        border-radius: 9999px;
        font-size: 0.72rem;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.92);
        color: #1f2937;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      }
      .pill--ok {
        color: #166534;
      }
      .pill--warn {
        color: #92400e;
        background: #fef3c7;
      }
      .pill--off {
        color: #6b7280;
      }
      .pill .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: currentColor;
      }
    `,
  ],
  template: `
    <div class="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl border border-brand-200">
      <div #mapEl class="absolute inset-0" aria-label="Mapa en vivo del reparto"></div>
      <div class="mapa-ruta-live-info">
        <span class="pill" [class]="estadoConexion()">
          <span class="dot"></span>
          {{ textoConexion() }}
        </span>
        @if (ultimaPosicion(); as p) {
          <span class="pill" [class]="claseEdad()">
            <span class="dot"></span>
            {{ textoEdad() }}
          </span>
          @if (estadoRuta(); as e) {
            <span class="pill pill--ok">Ruta: {{ e }}</span>
          }
          <span class="pill pill--ok">{{ p.repartidorNombre }}</span>
        }
      </div>
    </div>
  `,
})
export class MapaRutaLive implements AfterViewInit, OnDestroy {
  readonly rutaId = input<number | null>(null);
  readonly geometria = input<string | null | undefined>(null);
  readonly paradas = input<RutaPedidoResponse[]>([]);
  readonly origenLat = input<number | null | undefined>(null);
  readonly origenLng = input<number | null | undefined>(null);

  private readonly realtime = inject(RealtimeService);
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  private map?: L.Map;
  private capaBase?: L.LayerGroup;
  private capaLive?: L.LayerGroup;
  private markersPorId = new Map<number, L.Marker>();
  private markerRepartidor?: L.Marker;
  private trayectoLive?: L.Polyline;
  private listo = false;

  private subPosiciones?: StompSubscription | null;
  private subEventos?: StompSubscription | null;
  private subErrores?: StompSubscription | null;

  private readonly _conectado = signal(false);
  private readonly _ultimaPos = signal<PosicionBroadcastDto | null>(null);
  private readonly _edadSeg = signal<number | null>(null);
  private readonly _estadoRuta = signal<string | null>(null);
  private readonly _alertaEdad = signal(false);
  private readonly _ultimoError = signal<ErrorWsDto | null>(null);
  private readonly _rutaActiva = signal<number | null>(null);
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  readonly ultimaPosicion = this._ultimaPos.asReadonly();
  readonly conectado = this._conectado.asReadonly();
  readonly estadoRuta = this._estadoRuta.asReadonly();

  constructor() {
    effect(() => {
      const id = this.rutaId();
      this._rutaActiva.set(id);

      this.geometria();
      this.paradas();
      this.origenLat();
      this.origenLng();
      if (this.listo) this.redibujar();

      if (this._rutaActivaAnterior !== id) {
        this.limpiarSuscripcionesWs();
        this._ultimaPos.set(null);
        this._edadSeg.set(null);
        this._alertaEdad.set(false);
        this._estadoRuta.set(null);
        this._ultimoError.set(null);

        if (id != null) {
          this.suscribirseWs(id);
        }
        this._rutaActivaAnterior = id;
      }
    });
  }

  private _rutaActivaAnterior: number | null | undefined = undefined;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement, {
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this.map);
    this.capaBase = L.layerGroup().addTo(this.map);
    this.capaLive = L.layerGroup().addTo(this.map);
    this.listo = true;
    this.redibujar();
    setTimeout(() => this.map?.invalidateSize(), 0);

    this.subErrores = this.realtime.suscribirseAErrores((e) => {
      this._ultimoError.set(e);
    });

    this._conectado.set(this.realtime.estaConectado());

    this.tickHandle = setInterval(() => {
      this.recalcularEdad();
    }, 1000);

    const id = this.rutaId();
    if (id != null) this.suscribirseWs(id);
  }

  ngOnDestroy(): void {
    this.limpiarSuscripcionesWs();
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.map?.remove();
  }

  private suscribirseWs(id: number): void {
    this.subPosiciones = this.realtime.suscribirseAPosiciones(id, (pos) => {
      this._conectado.set(true);
      this._ultimaPos.set(pos);
      this._estadoRuta.set(pos.estadoRuta);
      this.recalcularEdad();
      this.dibujarRepartidorEnVivo(pos);
    });
    this.subEventos = this.realtime.suscribirseAEventos(id, (evt) => {
      this._estadoRuta.set(evt.estadoNuevo ?? this._estadoRuta());
      this.aplicarEvento(evt);
    });
  }

  private limpiarSuscripcionesWs(): void {
    this.subPosiciones?.unsubscribe();
    this.subEventos?.unsubscribe();
    this.subPosiciones = null;
    this.subEventos = null;
  }

  private aplicarEvento(evt: EventoRutaWsDto): void {
    if (evt.tipo === 'CAMBIO_ESTADO_RUTA' && evt.estadoNuevo) {
      this._estadoRuta.set(evt.estadoNuevo);
    }
  }

  private recalcularEdad(): void {
    const pos = this._ultimaPos();
    if (!pos) {
      this._edadSeg.set(null);
      this._alertaEdad.set(false);
      return;
    }
    const t = new Date(pos.serverTimestamp).getTime();
    if (Number.isNaN(t)) {
      this._edadSeg.set(null);
      return;
    }
    const seg = Math.max(0, Math.round((Date.now() - t) / 1000));
    this._edadSeg.set(seg);
    this._alertaEdad.set(seg > MAX_EDAD_SEGUNDOS_ACEPTABLE);
  }

  private redibujar(): void {
    if (!this.map || !this.capaBase || !this.capaLive) return;
    this.capaBase.clearLayers();
    this.markersPorId.clear();
    this.capaLive.clearLayers();

    const bounds = L.latLngBounds([]);

    const capaRuta = this.construirCapaRuta(this.geometria());
    let geoDibujada = false;
    if (capaRuta) {
      capaRuta.addTo(this.capaBase);
      try {
        const b = capaRuta.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          geoDibujada = true;
        }
      } catch {
      }
    }

    const oLat = this.origenLat();
    const oLng = this.origenLng();
    if (!geoDibujada) this.dibujarTrazadoParadas(oLat, oLng);

    if (oLat != null && oLng != null) {
      const m = L.marker([oLat, oLng], { icon: this.iconoOrigen() });
      m.bindTooltip(this.tooltipHtml('Origen / depósito'), this.opcionesTooltip());
      m.addTo(this.capaBase);
      bounds.extend([oLat, oLng]);
    }

    for (const p of this.paradas()) {
      const lat = p.cliente?.latitud;
      const lng = p.cliente?.longitud;
      if (lat == null || lng == null) continue;
      const marker = L.marker([Number(lat), Number(lng)], {
        icon: this.iconoParada(p.orden, p.estadoEntrega),
      });
      marker.bindTooltip(
        this.tooltipHtml(`${p.orden}. ${p.cliente?.nombre ?? 'Cliente'}`, p.cliente?.direccion),
        this.opcionesTooltip(),
      );
      marker.addTo(this.capaBase);
      this.markersPorId.set(p.id, marker);
      bounds.extend([Number(lat), Number(lng)]);
    }

    const pos = this._ultimaPos();
    if (pos) {
      this.dibujarRepartidorEnVivo(pos);
      bounds.extend([pos.latitud, pos.longitud]);
    }

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else {
      this.map.setView([-26.1916378, -58.1850831], 12);
    }
  }

  private dibujarRepartidorEnVivo(pos: PosicionBroadcastDto): void {
    if (!this.capaLive) return;
    if (!this.markerRepartidor) {
      this.markerRepartidor = L.marker([pos.latitud, pos.longitud], {
        icon: this.iconoRepartidor(),
        zIndexOffset: 1000,
      });
      this.markerRepartidor.bindTooltip(
        this.tooltipHtml('Repartidor en vivo'),
        this.opcionesTooltip(),
      );
      this.markerRepartidor.addTo(this.capaLive);
      this.trayectoLive = L.polyline([[pos.latitud, pos.longitud]], {
        color: '#2563eb',
        weight: 3,
        opacity: 0.8,
      }).addTo(this.capaLive);
    } else {
      this.markerRepartidor.setLatLng([pos.latitud, pos.longitud]);
      if (this.trayectoLive) {
        this.trayectoLive.addLatLng([pos.latitud, pos.longitud]);
      }
    }
  }

  private construirCapaRuta(raw: string | null | undefined): L.Polyline | L.GeoJSON | null {
    if (!raw) return null;
    const texto = raw.trim();
    if (texto === '') return null;

    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        const geo = JSON.parse(texto);
        return L.geoJSON(geo as unknown as GeoJSON.GeoJsonObject, {
          style: { color: '#d4a233', weight: 4, opacity: 0.9 },
        });
      } catch {
      }
    }

    const puntos = this.decodePolyline(texto, 5);
    if (puntos.length >= 2) {
      return L.polyline(puntos, { color: '#d4a233', weight: 4, opacity: 0.9 });
    }

    return null;
  }

  private decodePolyline(encoded: string, precision = 5): L.LatLngTuple[] {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates: L.LatLngTuple[] = [];
    const factor = Math.pow(10, precision);

    while (index < encoded.length) {
      let result = 1;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63 - 1;
        result += b << shift;
        shift += 5;
      } while (b >= 0x1f);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);

      result = 1;
      shift = 0;
      do {
        b = encoded.charCodeAt(index++) - 63 - 1;
        result += b << shift;
        shift += 5;
      } while (b >= 0x1f);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);

      coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
  }

  private dibujarTrazadoParadas(oLat?: number | null, oLng?: number | null): void {
    if (!this.capaBase) return;
    const puntos: L.LatLngExpression[] = [];
    if (oLat != null && oLng != null) {
      puntos.push([oLat, oLng]);
    }
    const ordenadas = [...this.paradas()].sort((a, b) => a.orden - b.orden);
    for (const p of ordenadas) {
      const lat = p.cliente?.latitud;
      const lng = p.cliente?.longitud;
      if (lat == null || lng == null) continue;
      puntos.push([Number(lat), Number(lng)]);
    }
    if (puntos.length < 2) return;
    L.polyline(puntos, {
      color: '#d4a233',
      weight: 3,
      opacity: 0.6,
      dashArray: '6 8',
    }).addTo(this.capaBase);
  }

  private opcionesTooltip(): L.TooltipOptions {
    return {
      direction: 'top',
      offset: [0, -12],
      opacity: 1,
      className: 'mapa-ruta-live-tooltip',
    };
  }

  private tooltipHtml(nombre: string, direccion?: string | null): string {
    const dir = (direccion ?? '').trim();
    const lineaDir = dir
      ? `<div style="font-size:11px;color:#4b5563;margin-top:2px;line-height:1.3;">${this.escaparHtml(dir)}</div>`
      : '';
    return (
      `<div style="line-height:1.3;">` +
      `<div style="font-weight:700;color:#1f2937;">${this.escaparHtml(nombre)}</div>` +
      lineaDir +
      `</div>`
    );
  }

  private escaparHtml(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private iconoOrigen(): L.DivIcon {
    return L.divIcon({
      className: '',
      html:
        '<div style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;' +
        'background:#1f2937;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.4)">.</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  private iconoParada(orden: number, estado: string): L.DivIcon {
    const color =
      estado === 'ENTREGADO'
        ? '#16a34a'
        : estado === 'FALLIDO'
          ? '#dc2626'
          : '#d4a233';
    return L.divIcon({
      className: '',
      html:
        `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;` +
        `background:${color};color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;` +
        `box-shadow:0 1px 3px rgba(0,0,0,.4)">${orden}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  private iconoRepartidor(): L.DivIcon {
    return L.divIcon({
      className: '',
      html:
        '<div style="display:grid;place-items:center;width:30px;height:30px;border-radius:50%;' +
        'background:#2563eb;color:#fff;font-size:13px;font-weight:700;border:3px solid #fff;' +
        'box-shadow:0 2px 6px rgba(37,99,235,.5)">R</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }


  textoConexion(): string {
    if (this._ultimoError()) {
      return `WS: ${this._ultimoError()!.codigo}`;
    }
    if (!this.realtime.estaConectado() && !this._conectado()) {
      return 'Sin conexión STOMP';
    }
    return 'En vivo';
  }

  estadoConexion(): string {
    if (this._ultimoError()) return 'pill--warn';
    if (this._conectado() || this.realtime.estaConectado()) return 'pill--ok';
    return 'pill--off';
  }

  textoEdad(): string {
    const seg = this._edadSeg();
    if (seg == null) return 'Esperando primera muestra…';
    if (seg < 60) return `Última muestra hace ${seg}s`;
    const min = Math.round(seg / 60);
    return `Última muestra hace ${min} min`;
  }

  claseEdad(): string {
    return this._alertaEdad() ? 'pill--warn' : 'pill--ok';
  }
}
