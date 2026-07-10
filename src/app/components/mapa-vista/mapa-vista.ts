import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';


@Component({
  selector: 'app-mapa-vista',
  standalone: true,
  template: `
    <div [class]="contenedorClase()">
      <div
        #mapEl
        class="absolute inset-0"
        aria-label="Ubicación del cliente en el mapa"
      ></div>
    </div>
  `,
})
export class MapaVista implements AfterViewInit, OnDestroy {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly etiqueta = input<string>('');
  readonly cuadrado = input<boolean>(false);

  protected readonly contenedorClase = computed(() => {
    const forma = this.cuadrado() ? 'aspect-square' : 'h-72';
    return `relative ${forma} w-full overflow-hidden rounded-xl border border-brand-200`;
  });

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;

  private readonly icono = L.divIcon({
    className: '',
    html:
      '<svg width="26" height="36" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="#d4a233"/>' +
      '<circle cx="12" cy="12" r="5" fill="#fff"/></svg>',
    iconSize: [26, 36],
    iconAnchor: [13, 36],
  });

  ngAfterViewInit(): void {
    const lat = this.lat();
    const lng = this.lng();

    this.map = L.map(this.mapEl().nativeElement, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this.map);

    const marker = L.marker([lat, lng], { icon: this.icono }).addTo(this.map);
    if (this.etiqueta()) marker.bindPopup(this.etiqueta());

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
