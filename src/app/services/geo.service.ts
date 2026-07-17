import { Injectable } from '@angular/core';

export const REGION_DEFAULT = {
  lat: -26.1916378,
  lng: -58.1850831,
  zoom: 13,
} as const;
export const FORMOSA_BOUNDS = {
  sur: -26.27, 
  norte: -26.08, 
  oeste: -58.32, 
  este: -58.12, 
} as const;

export function dentroDeFormosa(lat: number, lng: number): boolean {
  return (
    lat >= FORMOSA_BOUNDS.sur &&
    lat <= FORMOSA_BOUNDS.norte &&
    lng >= FORMOSA_BOUNDS.oeste &&
    lng <= FORMOSA_BOUNDS.este
  );
}

export interface GeoSugerencia {
  displayName: string;
  lat: number;
  lng: number;
  placeId: string | null;
}


@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly base = 'https://nominatim.openstreetmap.org';

  private readonly viewbox =
    `${FORMOSA_BOUNDS.oeste},${FORMOSA_BOUNDS.norte},${FORMOSA_BOUNDS.este},${FORMOSA_BOUNDS.sur}`;

  async buscar(query: string): Promise<GeoSugerencia[]> {
    const q = query.trim();
    if (q.length < 3) return [];

    const url =
      `${this.base}/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}` +
      `&countrycodes=ar` +
      `&viewbox=${this.viewbox}` +
      `&bounded=1` +
      `&addressdetails=1` +
      `&limit=6` +
      `&accept-language=es`;

    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data: any[] = await res.json();
      return data
        .map((d) => ({
          displayName: d.display_name as string,
          lat: Number(d.lat),
          lng: Number(d.lon),
          placeId: d.place_id != null ? String(d.place_id) : null,
        }))
        .filter((s) => dentroDeFormosa(s.lat, s.lng));
    } catch {
      return [];
    }
  }

  async direccionDe(lat: number, lng: number): Promise<GeoSugerencia | null> {
    const url =
      `${this.base}/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}` +
      `&addressdetails=1&accept-language=es`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const d: any = await res.json();
      if (!d || !d.display_name) return null;
      return {
        displayName: d.display_name as string,
        lat: Number(d.lat),
        lng: Number(d.lon),
        placeId: d.place_id != null ? String(d.place_id) : null,
      };
    } catch {
      return null;
    }
  }
}
