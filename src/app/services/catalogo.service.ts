import { Injectable, inject } from '@angular/core';
import { Garrafa, GarrafaRequest } from '../models/garrafa.model';
import { Usuario } from '../models/usuario.model';
import { DbService } from './db.service';
import { ApiUsuarioService } from './api-usuario.service';
import { ApiGarrafaService } from './api-garrafa.service';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private db = inject(DbService);
  private apiUsuario = inject(ApiUsuarioService);
  private apiGarrafa = inject(ApiGarrafaService);

  getGarrafasActivas(): Promise<Garrafa[]> {
    return this.db.garrafas.filter((g) => g.activo).toArray();
  }

  async crearGarrafa(datos: GarrafaRequest): Promise<number> {
    if (!navigator.onLine) {
      throw new Error('No se pueden crear garrafas sin conexión a internet.');
    }
    const resp = await this.apiGarrafa.crear({ ...datos, activo: true });
    const local = ApiGarrafaService.toLocal(resp);
    await this.db.garrafas.put(local);
    return local.id!;
  }

  getUsuariosActivos(): Promise<Usuario[]> {
    return this.db.usuarios.filter((u) => u.activo).sortBy('apellido');
  }

  getUsuariosInactivos(): Promise<Usuario[]> {
    return this.db.usuarios.filter((u) => !u.activo).sortBy('apellido');
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

  /** Baja lógica: nunca se borra el registro, solo se marca como inactivo */
  async darBajaUsuario(id: number): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se pueden dar de baja usuarios sin conexión a internet.');
    }
    try {
      await this.apiUsuario.eliminar(id);
    } catch (e) {
      console.error('Error dando de baja usuario en backend', e);
      throw new Error('No se pudo dar de baja el usuario en el servidor.');
    }
    await this.db.usuarios.update(id, { activo: false });
  }

  /** Reactiva un usuario dado de baja */
  async reactivarUsuario(id: number): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se pueden reactivar usuarios sin conexión a internet.');
    }
    const u = await this.db.usuarios.get(id);
    if (!u) throw new Error('Usuario no encontrado.');
    try {
      await this.apiUsuario.actualizar(id, {
        nombre: u.nombre,
        apellido: u.apellido,
        dni: u.dni,
        telefono: u.telefono || undefined,
        direccion: u.direccion || undefined,
        activo: true,
      });
    } catch (e) {
      console.error('Error reactivando usuario en backend', e);
      throw new Error('No se pudo reactivar el usuario en el servidor.');
    }
    await this.db.usuarios.update(id, { activo: true });
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
