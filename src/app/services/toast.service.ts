import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  mensaje: string;
  tipo: 'error' | 'exito' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private contador = 0;


  readonly toasts = signal<Toast[]>([]);

  mostrar(mensaje: string, tipo: Toast['tipo'] = 'info', duracionMs = 3500): void {
    const id = ++this.contador;
    this.toasts.update((t) => [...t, { id, mensaje, tipo }]);
    setTimeout(() => this.cerrar(id), duracionMs);
  }

  error(mensaje: string): void {
    this.mostrar(mensaje, 'error');
  }

  exito(mensaje: string): void {
    this.mostrar(mensaje, 'exito');
  }

  cerrar(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
