import { Injectable, inject } from '@angular/core';
import { Garrafa } from '../models/garrafa.model';
import { Usuario } from '../models/usuario.model';
import { DbService } from './db.service';
import { ApiUsuarioService } from './api-usuario.service';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private db = inject(DbService);
  private apiUsuario = inject(ApiUsuarioService);

  getGarrafasActivas(): Promise<Garrafa[]> {
    return this.db.garrafas.filter((g) => g.activo).toArray();
  }

  getUsuariosActivos(): Promise<Usuario[]> {
    return this.db.usuarios.filter((u) => u.activo).sortBy('apellido');
  }

  async crearUsuario(datos: Omit<Usuario, 'id' | 'created_at' | 'activo'>): Promise<number> {
    if (!navigator.onLine) {
      throw new Error('No se pueden crear usuarios sin conexión a internet.');
    }
    const request = {
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni,
      telefono: datos.telefono || undefined,
      direccion: datos.direccion || undefined,
    };
    const resp = await this.apiUsuario.crear(request);
    const local = ApiUsuarioService.toLocal(resp);
    await this.db.usuarios.put(local);
    return local.id!;
  }

  async eliminarUsuario(id: number): Promise<void> {
    if (navigator.onLine) {
      try {
        await this.apiUsuario.eliminar(id);
      } catch (e) {
        console.error('Error eliminando usuario en backend', e);
        throw new Error('No se pudo eliminar el usuario en el servidor.');
      }
    } else {
      throw new Error('No se pueden eliminar usuarios sin conexión a internet.');
    }

    const tienePedidos = await this.db.pedidos.where('usuarioId').equals(id).count();
    if (tienePedidos > 0) {
      await this.db.usuarios.update(id, { activo: false });
    } else {
      await this.db.usuarios.delete(id);
    }
  }

  /** Reemplaza los datos locales con lo traído del backend */
  async sincronizarGarrafas(garrafas: Garrafa[]): Promise<void> {
    await this.db.transaction('rw', this.db.garrafas, async () => {
      await this.db.garrafas.clear();
      await this.db.garrafas.bulkAdd(garrafas);
    });
  }

  /** Reemplaza los datos locales con lo traído del backend */
  async sincronizarUsuarios(usuarios: Usuario[]): Promise<void> {
    await this.db.transaction('rw', this.db.usuarios, async () => {
      await this.db.usuarios.clear();
      await this.db.usuarios.bulkAdd(usuarios);
    });
  }
}
