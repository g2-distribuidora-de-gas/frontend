import { Injectable, inject } from '@angular/core';
import { Garrafa, GarrafaRequest, TipoGarrafa } from '../models/garrafa.model';
import { Usuario } from '../models/usuario.model';
import { RxDatabaseService } from './rx-database.service';
import { ApiUsuarioService } from './api-usuario.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private rxDb = inject(RxDatabaseService);
  private apiUsuario = inject(ApiUsuarioService);
  private apiGarrafa = inject(ApiGarrafaService);

  garrafasActivas$(): Observable<Garrafa[]> {
    return this.rxDb.garrafas
      .find({ selector: { activo: true } })
      .$.pipe(map((docs) => docs.map((d) => d.toJSON() as unknown as Garrafa)));
  }

  async crearGarrafa(datos: GarrafaRequest): Promise<string> {
    if (!navigator.onLine) {
      throw new Error('No se pueden crear garrafas.');
    }
    const resp = await this.apiGarrafa.crear({ ...datos, activo: true });
    const local: Garrafa = {
      id: String(resp.id),
      tipo: resp.tipo,
      capacidadKg: resp.capacidadKg,
      precio: resp.precio,
      stockDisponible: resp.stockDisponible,
      activo: resp.activo,
      updatedAt: new Date().toISOString(),
    };
    await this.rxDb.garrafas.upsert(local);
    return local.id;
  }

  
  async reponerStock(id: string, cantidadAgregar: number): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se puede reponer stock sin conexión.');
    }
    const doc = await this.rxDb.garrafas.findOne(id).exec();
    if (!doc) throw new Error('Garrafa no encontrada.');

    const nuevoStock = (doc.stockDisponible ?? 0) + cantidadAgregar;

    await this.apiGarrafa.actualizar(Number(id), {
      tipo: doc.tipo as TipoGarrafa,
      capacidadKg: doc.capacidadKg,
      precio: doc.precio,
      stockDisponible: nuevoStock,
      activo: doc.activo,
    });

    
    await doc.patch({ stockDisponible: nuevoStock, updatedAt: new Date().toISOString() });
  }

  async getUsuariosActivos(): Promise<Usuario[]> {
    const docs = await this.rxDb.usuarios.find({ selector: { activo: true } }).exec();
    const usuarios = docs.map((d) => d.toJSON() as unknown as Usuario);
    return usuarios.sort((a, b) => a.apellido.localeCompare(b.apellido));
  }

  async getUsuariosInactivos(): Promise<Usuario[]> {
    const docs = await this.rxDb.usuarios.find({ selector: { activo: false } }).exec();
    const usuarios = docs.map((d) => d.toJSON() as unknown as Usuario);
    return usuarios.sort((a, b) => a.apellido.localeCompare(b.apellido));
  }

  async crearUsuario(datos: Omit<Usuario, 'id' | 'updatedAt' | 'activo'>): Promise<string> {
    if (!navigator.onLine) {
      throw new Error('No se pueden crear usuarios.');
    }
    const request = {
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni,
      telefono: datos.telefono || undefined,
      direccion: datos.direccion || undefined,
    };
    const resp = await this.apiUsuario.crear(request);
    const local: Usuario = {
      id: String(resp.id),
      nombre: resp.nombre,
      apellido: resp.apellido,
      dni: resp.dni,
      telefono: resp.telefono ?? '',
      direccion: resp.direccion ?? '',
      activo: resp.activo,
      updatedAt: new Date().toISOString(),
    };
    await this.rxDb.usuarios.upsert(local);
    return local.id;
  }

  /** Baja lógica: nunca se borra el registro, solo se marca como inactivo */
  async darBajaUsuario(id: string): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se pueden dar de baja usuarios.');
    }
    try {
      await this.apiUsuario.eliminar(Number(id));
    } catch (e) {
      console.error('Error dando de baja usuario en backend', e);
      throw new Error('No se pudo dar de baja el usuario en el servidor.');
    }
    const doc = await this.rxDb.usuarios.findOne(id).exec();
    if (doc) {
      await doc.patch({ activo: false, updatedAt: new Date().toISOString() });
    }
  }

  /** Reactiva un usuario dado de baja */
  async reactivarUsuario(id: string): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se pueden reactivar usuarios sin conexión a internet.');
    }
    const doc = await this.rxDb.usuarios.findOne(id).exec();
    if (!doc) throw new Error('Usuario no encontrado.');

    try {
      await this.apiUsuario.actualizar(Number(id), {
        nombre: doc.nombre,
        apellido: doc.apellido,
        dni: doc.dni,
        telefono: doc.telefono || undefined,
        direccion: doc.direccion || undefined,
        activo: true,
      });
    } catch (e) {
      console.error('Error reactivando usuario en backend', e);
      throw new Error('No se pudo reactivar el usuario en el servidor.');
    }
    await doc.patch({ activo: true, updatedAt: new Date().toISOString() });
  }
}
