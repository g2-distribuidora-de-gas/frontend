import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import {GeoService, GeoSugerencia, REGION_DEFAULT, FORMOSA_BOUNDS, dentroDeFormosa} from '../../services/geo.service';
import { ToastService } from '../../services/toast.service';

export interface UbicacionSeleccionada {
  lat: number;
  lng: number;
  direccion?: string;
  placeId?: string | null;
}


@Component({
  selector: 'app-mapa-picker',
  standalone: true,
  template: `
    <div class="space-y-2">
      <div class="relative">
        <input
          type="search"
          [value]="texto()"
          (input)="onBuscar($any($event.target).value)"
          placeholder="Buscar dirección en el mapa…"
          class="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-brand-700/40 focus:border-brand-400"
          autocomplete="off"
        />
        @if (buscando()) {
          <span class="absolute right-3 top-2.5 text-xs text-brand-700/50">Buscando…</span>
        }
        @if (sugerencias().length > 0) {
          <ul
            class="absolute z-[1000] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-brand-200 bg-white shadow-lg"
          >
            @for (s of sugerencias(); track s.placeId ?? s.displayName) {
              <li>
                <button
                  type="button"
                  (click)="elegirSugerencia(s)"
                  class="block w-full truncate px-3 py-2 text-left text-xs text-brand-800 hover:bg-brand-50"
                  [title]="s.displayName"
                >
                  {{ s.displayName }}
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <div
        #mapEl
        class="h-64 w-full overflow-hidden rounded-xl border border-brand-200"
        aria-label="Mapa para marcar la ubicación del cliente"
      ></div>

      <p class="text-xs text-brand-700/60">
        @if (tieneUbicacion()) {
          Ubicación marcada: {{ coordTexto() }}. Arrastrá el pin o tocá el mapa para ajustarla.
        } @else {
          Buscá una dirección o tocá el mapa para marcar la ubicación del cliente.
        }
      </p>
    </div>
  `,
})
export class MapaPicker implements AfterViewInit, OnDestroy {
  private geo = inject(GeoService);
  private toast = inject(ToastService);

  readonly latInicial = input<number | null>(null);
  readonly lngInicial = input<number | null>(null);

  readonly ubicacionChange = output<UbicacionSeleccionada>();

  private static readonly INTERVALO_MARCA_MS = 5000;
  private ultimaMarcaMs = 0;
  private ultimaValida?: { lat: number; lng: number };

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  protected texto = signal('');
  protected sugerencias = signal<GeoSugerencia[]>([]);
  protected buscando = signal(false);
  protected tieneUbicacion = signal(false);
  protected coordTexto = signal('');

  private map?: L.Map;
  private marker?: L.Marker;
  private debounce?: ReturnType<typeof setTimeout>;

  private readonly icono = L.divIcon({
    className: '',
    html:
      '<svg width="30" height="42" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="#d4a233"/>' +
      '<circle cx="12" cy="12" r="5" fill="#fff"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });

  ngAfterViewInit(): void {
    const lat = this.latInicial() ?? REGION_DEFAULT.lat;
    const lng = this.lngInicial() ?? REGION_DEFAULT.lng;
    const limites = L.latLngBounds(
      [FORMOSA_BOUNDS.sur, FORMOSA_BOUNDS.oeste],
      [FORMOSA_BOUNDS.norte, FORMOSA_BOUNDS.este],
    );

    this.map = L.map(this.mapEl().nativeElement, {
      center: [lat, lng],
      zoom: REGION_DEFAULT.zoom,
      maxBounds: limites,
      maxBoundsViscosity: 1.0,
      minZoom: 12,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);

    if (this.latInicial() != null && this.lngInicial() != null) {
      this.fijarMarcador(lat, lng, false);
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (!dentroDeFormosa(e.latlng.lat, e.latlng.lng)) {
        this.toast.mostrar('Solo se pueden marcar ubicaciones dentro de la ciudad de Formosa.', 'info');
        return;
      }
      if (this.marcadoDemasiadoRapido()) return;
      this.fijarMarcador(e.latlng.lat, e.latlng.lng, true);
    });

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.map?.remove();
  }

  protected onBuscar(valor: string): void {
    this.texto.set(valor);
    if (this.debounce) clearTimeout(this.debounce);
    if (valor.trim().length < 3) {
      this.sugerencias.set([]);
      return;
    }
    this.buscando.set(true);
    this.debounce = setTimeout(async () => {
      this.sugerencias.set(await this.geo.buscar(valor));
      this.buscando.set(false);
    }, 500);
  }

  protected elegirSugerencia(s: GeoSugerencia): void {
    this.sugerencias.set([]);
    this.texto.set('');
    this.map?.setView([s.lat, s.lng], 16);
    this.fijarMarcador(s.lat, s.lng, false, s.displayName, s.placeId);
  }

  private fijarMarcador(
    lat: number,
    lng: number,
    reverse: boolean,
    direccion?: string,
    placeId?: string | null,
  ): void {
    if (!this.map) return;

    if (!this.marker) {
      this.marker = L.marker([lat, lng], {
        draggable: true,
        icon: this.icono,
      }).addTo(this.map);
      this.marker.on('dragend', () => {
        const p = this.marker!.getLatLng();
        if (!dentroDeFormosa(p.lat, p.lng)) {
          this.toast.mostrar('El pin debe quedar dentro de la ciudad de Formosa.', 'info');
          const prev = this.ultimaValida;
          if (prev) this.marker!.setLatLng([prev.lat, prev.lng]);
          return;
        }
        this.fijarMarcador(p.lat, p.lng, true);
      });
    } else {
      this.marker.setLatLng([lat, lng]);
    }

    this.tieneUbicacion.set(true);
    this.ultimaValida = { lat, lng };
    this.coordTexto.set(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    this.ubicacionChange.emit({ lat, lng, direccion, placeId });

    if (reverse) {
      this.geo.direccionDe(lat, lng).then((r) => {
        if (r) this.ubicacionChange.emit({ lat, lng, direccion: r.displayName, placeId: r.placeId });
      });
    }
  }

  private marcadoDemasiadoRapido(): boolean {
    const ahora = Date.now();
    const transcurrido = ahora - this.ultimaMarcaMs;
    if (this.ultimaMarcaMs > 0 && transcurrido < MapaPicker.INTERVALO_MARCA_MS) {
      const restante = Math.ceil((MapaPicker.INTERVALO_MARCA_MS - transcurrido) / 1000);
      this.toast.mostrar(`Solo se puede marcar una ubicación cada 5 segundos. Esperá ${restante}s.`, 'info');
      return true;
    }
    this.ultimaMarcaMs = ahora;
    return false;
  }
}
