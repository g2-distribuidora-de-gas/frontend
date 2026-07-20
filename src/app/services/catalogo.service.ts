import { Injectable, inject } from '@angular/core';
import { Garrafa, TipoGarrafaStockRequest } from '../models/garrafa.model';
import { Deposito, DepositoRequest, depositoToLocal } from '../models/deposito.model';
import { Cliente } from '../models/cliente.model';
import { RxDatabaseService } from './rx-database.service';
import { ApiClienteService } from './api-cliente.service';
import { ApiGarrafaService } from './api-garrafa.service';
import { ApiDepositoService } from './api-deposito.service';
import { DbRecoveryService } from './db-recovery.service';
import { ReplicationService } from './replication.service';
import { Observable, EMPTY } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private rxDb = inject(RxDatabaseService);
  private apiCliente = inject(ApiClienteService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiDeposito = inject(ApiDepositoService);
  private recovery = inject(DbRecoveryService);
  private replication = inject(ReplicationService);

  garrafasActivas$(): Observable<Garrafa[]> {
    return this.protegerDbCerrada(
      this.rxDb.garrafas
        .find({ selector: { activo: true } })
        .$.pipe(map((docs) => docs.map((d) => d.toJSON() as unknown as Garrafa))),
    );
  }

  garrafasTodas$(): Observable<Garrafa[]> {
    return this.protegerDbCerrada(
      this.rxDb.garrafas
        .find({ sort: [{ codigo: 'asc' }] })
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

  async crearGarrafa(datos: TipoGarrafaStockRequest): Promise<string> {
    if (!navigator.onLine) {
      throw new Error('No se pueden crear tipos de garrafa.');
    }
    const resp = await this.apiGarrafa.crear(datos);
    const local = ApiGarrafaService.toLocal(resp);

    if (!local.precio && datos.precio != null) local.precio = datos.precio;
    await this.rxDb.garrafas.upsert(local);
    return local.id;
  }

  async editarGarrafa(
    id: string,
    cambios: { descripcion?: string; capacidadKg?: number; precio?: number },
  ): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se puede editar el tipo de garrafa.');
    }
    const doc = await this.rxDb.garrafas.findOne(id).exec();
    if (!doc) throw new Error('Tipo de garrafa no encontrado.');

    const descripcion = cambios.descripcion ?? doc.descripcion ?? '';
    const capacidadKg = cambios.capacidadKg ?? doc.capacidadKg;
    const precio = cambios.precio ?? doc.precio ?? 0;

    const resp = await this.apiGarrafa.actualizar(Number(id), {
      codigo: doc.codigo,
      descripcion,
      capacidadKg,
      precio,
    });

    await doc.patch({
      descripcion: resp.descripcion ?? descripcion,
      capacidadKg: resp.capacidadKg ?? capacidadKg,
      precio: resp.precio ?? precio,
      updatedAt: new Date().toISOString(),
    });
  }

  async cambiarEstadoGarrafa(id: string, activo: boolean): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No se puede cambiar el estado.');
    }
    const doc = await this.rxDb.garrafas.findOne(id).exec();
    if (!doc) throw new Error('Tipo de garrafa no encontrado.');
    const resp = await this.apiGarrafa.cambiarEstado(Number(id), activo);
    await doc.patch({ activo: resp.activo, updatedAt: new Date().toISOString() });
  }

  // ─── Depósitos (catálogo cacheado offline) ───

  depositosActivos$(): Observable<Deposito[]> {
    return this.protegerDbCerrada(
      this.rxDb.depositos
        .find({ selector: { activo: true }, sort: [{ nombre: 'asc' }] })
        .$.pipe(map((docs) => docs.map((d) => d.toJSON() as unknown as Deposito))),
    );
  }

  depositosTodos$(): Observable<Deposito[]> {
    return this.protegerDbCerrada(
      this.rxDb.depositos
        .find({ sort: [{ nombre: 'asc' }] })
        .$.pipe(map((docs) => docs.map((d) => d.toJSON() as unknown as Deposito))),
    );
  }

  async getDepositos(): Promise<Deposito[]> {
    const docs = await this.rxDb.depositos.find({ sort: [{ nombre: 'asc' }] }).exec();
    return docs.map((d) => d.toJSON() as unknown as Deposito);
  }

  async crearDeposito(datos: DepositoRequest): Promise<string> {
    if (!navigator.onLine) throw new Error('No se pueden crear depósitos.');
    const resp = await this.apiDeposito.crear(datos);
    const local = depositoToLocal(resp);
    await this.rxDb.depositos.upsert(local);
    return local.id;
  }

  async editarDeposito(id: string, datos: DepositoRequest): Promise<void> {
    if (!navigator.onLine) throw new Error('No se puede editar el depósito.');
    const resp = await this.apiDeposito.actualizar(Number(id), datos);
    await this.rxDb.depositos.upsert(depositoToLocal(resp));
  }

  async cambiarEstadoDeposito(id: string, activo: boolean): Promise<void> {
    if (!navigator.onLine) throw new Error('No se puede cambiar el estado.');
    const resp = await this.apiDeposito.cambiarEstado(Number(id), activo);
    await this.rxDb.depositos.upsert(depositoToLocal(resp));
  }

  async refrescarDepositos(): Promise<void> {
    if (!navigator.onLine) return;
    const lista = await this.apiDeposito.listar({ soloActivos: false });
    for (const d of lista) {
      await this.rxDb.depositos.upsert(depositoToLocal(d));
    }
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
        throw new Error('No se pueden editar clientes.');
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