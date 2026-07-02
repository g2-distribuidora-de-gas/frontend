import { Injectable, inject } from '@angular/core';
import { Cliente, Producto } from '../models';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private db = inject(DbService);

  getProductosActivos(): Promise<Producto[]> {
    return this.db.productos.filter((p) => p.activo).toArray();
  }

  getClientesActivos(): Promise<Cliente[]> {
    return this.db.clientes.filter((c) => c.activo).sortBy('apellido');
  }
}
