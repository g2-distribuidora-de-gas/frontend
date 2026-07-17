import { Injectable, inject } from '@angular/core';
import { Garrafa, GarrafaRequest, TipoGarrafa } from '../models/garrafa.model';
import { Cliente } from '../models/cliente.model';
import { RxDatabaseService } from './rx-database.service';
import { ApiClienteService } from './api-cliente.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { DbRecoveryService } from './db-recovery.service';
import { ReplicationService } from './replication.service';
import { Observable, EMPTY } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private rxDb = inject(RxDatabaseService);
  private apiCliente = inject(ApiClienteService);
  private apiGarrafa = inject(ApiGarrafaService);
  private recovery = inject(DbRecoveryService);
  private replication = inject(ReplicationService);

  garrafasActivas$(): Observable<Garrafa[]> {
    return this.protegerDbCerrada(
      this.rxDb.garrafas
        .find({ selector: { activo: true } })
        .$.pipe(map((docs) => docs.map((d) => d.toJSON() as unknown as Garrafa))),
    );
  }

  clientesActivos$(): Observable<Cliente[]> {
    return this.protegerDbCerrada(
      this.rxDb.clientes
        .find({ selector: { activo: true } })
        .$.pipe(map((docs) => this.ordenar(docs.map((d) => d.toJSON() as unknown as Cliente)))),
    );
  }

  clientesInactivos$(): Observable<Cliente[]> {
    return this.protegerDbCerrada(
      this.rxDb.clientes
        .find({ selector: { activo: false } })
        .$.pipe(map((docs) => this.ordenar(docs.map((d) => d.toJSON() as unknown as Cliente)))),
    );
  }

  private protegerDbCerrada<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      catchError((err: any) => {
        if (err?.name === 'DatabaseClosedError') {
          void this.recovery.manejarDbCerrada();
          return EMPTY;
        }
        throw err;
      }),
    );
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
  async editarGarrafa(
    id: string,
    cambios: { precio?: number; stockDisponible?: number },
  ): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se puede editar la garrafa.');
    }
    const doc = await this.rxDb.garrafas.findOne(id).exec();
    if (!doc) throw new Error('Garrafa no encontrada.');

    const precio = cambios.precio ?? doc.precio;
    const stockDisponible = cambios.stockDisponible ?? doc.stockDisponible ?? 0;

    await this.apiGarrafa.actualizar(Number(id), {
      tipo: doc.tipo as TipoGarrafa,
      capacidadKg: doc.capacidadKg,
      precio,
      stockDisponible,
      activo: doc.activo,
    });

    await doc.patch({ precio, stockDisponible, updatedAt: new Date().toISOString() });
  }

  async reponerStock(id: string, cantidadAgregar: number): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se puede reponer stock.');
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

  async getClientesActivos(): Promise<Cliente[]> {
    const docs = await this.rxDb.clientes.find({ selector: { activo: true } }).exec();
    return this.ordenar(docs.map((d) => d.toJSON() as unknown as Cliente));
  }

  async getClientesInactivos(): Promise<Cliente[]> {
    const docs = await this.rxDb.clientes.find({ selector: { activo: false } }).exec();
    return this.ordenar(docs.map((d) => d.toJSON() as unknown as Cliente));
  }

  private ordenar(clientes: Cliente[]): Cliente[] {
    return clientes.sort((a, b) => this.nombreOrden(a).localeCompare(this.nombreOrden(b)));
  }

  private nombreOrden(c: Cliente): string {
    return (c.apellido || c.nombre || '').toLowerCase();
  }

  async crearCliente(
    datos: Omit<Cliente, 'id' | 'updatedAt' | 'activo'>,
  ): Promise<string> {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();

    const local = {
      id: uuid,
      backendId: null,
      sincronizado: false,
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono ?? '',
      direccion: datos.direccion,
      activo: true,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      placeId: datos.placeId ?? null,
      updatedAt: now,
    } satisfies Cliente;
    await this.rxDb.clientes.upsert(local);

    if (navigator.onLine) {
      try {
        await this.replication.asegurarClienteSincronizado(uuid);
      } catch {
      }
    }

    return uuid;
  }


  async backendIdDe(id: string): Promise<number | null> {
    const doc = await this.rxDb.clientes.findOne(id).exec();
    if (doc?.backendId != null) return doc.backendId;
    return /^\d+$/.test(id) ? Number(id) : null;
  }

  async editarCliente(
    id: string,
    datos: Omit<Cliente, 'id' | 'updatedAt' | 'activo'>,
  ): Promise<void> {
    const doc = await this.rxDb.clientes.findOne(id).exec();
    if (!doc) throw new Error('Cliente no encontrado.');

    const yaEnBackend = doc.sincronizado && doc.backendId != null;

    if (yaEnBackend) {
      if (!navigator.onLine) {
        throw new Error('No se pueden editar clientes sin conexión.');
      }
      const nombreCompleto = `${datos.nombre} ${datos.apellido}`.trim();
      const resp = await this.apiCliente.actualizar(doc.backendId!, {
        nombre: nombreCompleto,
        telefono: datos.telefono || undefined,
        direccion: datos.direccion,
        latitud: datos.latitud ?? null,
        longitud: datos.longitud ?? null,
      });
      await doc.patch({
        nombre: datos.nombre,
        apellido: datos.apellido,
        telefono: resp.telefono ?? datos.telefono ?? '',
        direccion: resp.direccion ?? datos.direccion,
        latitud: datos.latitud ?? resp.latitud ?? null,
        longitud: datos.longitud ?? resp.longitud ?? null,
        placeId: datos.placeId ?? resp.placeId ?? null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    await doc.patch({
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono ?? '',
      direccion: datos.direccion,
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      placeId: datos.placeId ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  async darBajaCliente(id: string): Promise<void> {
    const doc = await this.rxDb.clientes.findOne(id).exec();
    if (!doc) throw new Error('Cliente no encontrado.');
    await doc.patch({ activo: false, updatedAt: new Date().toISOString() });
  }

  async reactivarCliente(id: string): Promise<void> {
    const doc = await this.rxDb.clientes.findOne(id).exec();
    if (!doc) throw new Error('Cliente no encontrado.');
    await doc.patch({ activo: true, updatedAt: new Date().toISOString() });
  }
}