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

  crearCliente(datos: Omit<Cliente, 'id' | 'created_at' | 'activo'>): Promise<number> {
    return this.db.clientes.add({ ...datos, created_at: new Date().toISOString(), activo: true });
  }

  
  async eliminarCliente(id: number): Promise<void> {
    const tienePedidos = await this.db.pedidos.where('id_cliente').equals(id).count();
    if (tienePedidos > 0) {
      await this.db.clientes.update(id, { activo: false });
    } else {
      await this.db.clientes.delete(id);
    }
  }
}
