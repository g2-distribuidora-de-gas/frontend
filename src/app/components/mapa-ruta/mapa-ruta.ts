import {AfterViewInit, Component, ElementRef, OnDestroy, ViewEncapsulation, effect, input, output, viewChild} from '@angular/core';
import * as L from 'leaflet';
import { RutaPedidoResponse } from '../../models/ruta.model';


@Component({
  selector: 'app-mapa-ruta',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .leaflet-tooltip.mapa-ruta-tooltip {
      white-space: normal;
      width: max-content;
      max-width: 220px;
      padding: 6px 8px;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
    }
    @media (max-width: 480px) {
      .leaflet-tooltip.mapa-ruta-tooltip { max-width: 60vw; }
    }
  `],
  template: `
    <div class="relative h-full min-h-[20rem] w-full overflow-hidden rounded-xl border border-brand-200">
      <div #mapEl class="absolute inset-0" aria-label="Mapa de la ruta de reparto"></div>
    </div>
  `,
})
export class MapaRuta implements AfterViewInit, OnDestroy {
  readonly geometria = input<string | null | undefined>(null);
  readonly paradas = input<RutaPedidoResponse[]>([]);
  readonly origenLat = input<number | null | undefined>(null);
  readonly origenLng = input<number | null | undefined>(null);

  readonly seleccionadaId = input<number | null>(null);

  readonly paradaClick = output<number>();

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private capaRuta?: L.LayerGroup;
  private markersPorId = new Map<number, L.Marker>();
  private listo = false;

  constructor() {
    effect(() => {
      this.geometria();
      this.paradas();
      this.origenLat();
      this.origenLng();
      if (this.listo) this.redibujar();
    });
    effect(() => {
      const id = this.seleccionadaId();
      if (this.listo && id != null) this.enfocar(id);
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement, { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);
    this.capaRuta = L.layerGroup().addTo(this.map);
    this.listo = true;
    this.redibujar();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private iconoOrigen(): L.DivIcon {
    return L.divIcon({
      className: '',
      html:
        '<div style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;' +
        'background:#1f2937;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.4)">🏭</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  private iconoParada(orden: number, estado: string, activa: boolean): L.DivIcon {
    const color =
      estado === 'ENTREGADO' ? '#16a34a' : estado === 'FALLIDO' ? '#dc2626' : '#d4a233';
    const ring = activa ? 'box-shadow:0 0 0 4px rgba(212,162,51,.45);' : 'box-shadow:0 1px 3px rgba(0,0,0,.4);';
    return L.divIcon({
      className: '',
      html:
        `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;` +
        `background:${color};color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;${ring}">${orden}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
  private opcionesTooltip(): L.TooltipOptions {
    return { direction: 'top', offset: [0, -12], opacity: 1, className: 'mapa-ruta-tooltip' };
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

  private redibujar(): void {
    if (!this.map || !this.capaRuta) return;
    this.capaRuta.clearLayers();
    this.markersPorId.clear();

    const bounds = L.latLngBounds([]);

    const capaRutaLinea = this.construirCapaRuta(this.geometria());
    let geoDibujada = false;
    if (capaRutaLinea) {
      capaRutaLinea.addTo(this.capaRuta);
      try {
        const b = capaRutaLinea.getBounds();
        if (b.isValid()) {
          bounds.extend(b);
          geoDibujada = true;
        }
      } catch { /* geometría vacía */ }
    }

    const oLat = this.origenLat();
    const oLng = this.origenLng();
    if (!geoDibujada) {
      this.dibujarTrazadoParadas(oLat, oLng);
    }

    if (oLat != null && oLng != null) {
      const m = L.marker([oLat, oLng], { icon: this.iconoOrigen() });
      m.bindTooltip(this.tooltipHtml('Origen / depósito'), this.opcionesTooltip());
      m.addTo(this.capaRuta);
      bounds.extend([oLat, oLng]);
    }

    for (const p of this.paradas()) {
      const lat = p.cliente?.latitud;
      const lng = p.cliente?.longitud;
      if (lat == null || lng == null) continue;
      const activa = this.seleccionadaId() === p.id;
      const marker = L.marker([Number(lat), Number(lng)], {
        icon: this.iconoParada(p.orden, p.estadoEntrega, activa),
      });
      marker.bindTooltip(
        this.tooltipHtml(`${p.orden}. ${p.cliente?.nombre ?? 'Cliente'}`, p.cliente?.direccion),
        this.opcionesTooltip(),
      );
      marker.on('click', () => this.paradaClick.emit(p.id));
      marker.addTo(this.capaRuta);
      this.markersPorId.set(p.id, marker);
      bounds.extend([Number(lat), Number(lng)]);
    }

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else {
      this.map.setView([-26.1916378, -58.1850831], 12);
    }
  }
  private construirCapaRuta(raw: string | null | undefined): L.Polyline | L.GeoJSON | null {
    if (!raw) return null;
    const texto = raw.trim();
    if (texto === '') return null;

    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        const geo = JSON.parse(texto);
        return L.geoJSON(geo as any, {
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
    if (!this.capaRuta) return;

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
    }).addTo(this.capaRuta);
  }

  private enfocar(id: number): void {
    this.redibujar();
    const marker = this.markersPorId.get(id);
    if (marker && this.map) {
      this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 15), { animate: true });
      marker.openTooltip();
    }
  }
}