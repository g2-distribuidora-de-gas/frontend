import { Injectable, Injector, inject } from '@angular/core';
import {
  RxDatabase,
  RxCollection,
  createRxDatabase,
  addRxPlugin,
  isRxDatabase,
} from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { clienteSchema, ClienteDocType } from '../schemas/cliente.schema';
import { garrafaSchema, GarrafaDocType } from '../schemas/garrafa.schema';
import { pedidoSchema, PedidoDocType } from '../schemas/pedido.schema';
import { environment } from '../../environments/environment';


export type EstadoPedido = 'PENDIENTE' | 'EN_PROCESO' | 'ENTREGADO' | 'CANCELADO' | 'REPROGRAMADO';

export interface EstadoInfo {
  id: EstadoPedido;
  nombre: string;
}

export const ESTADOS: EstadoInfo[] = [
  { id: 'PENDIENTE', nombre: 'Pendiente' },
  { id: 'EN_PROCESO', nombre: 'En proceso' },
  { id: 'ENTREGADO', nombre: 'Entregado' },
  { id: 'CANCELADO', nombre: 'Cancelado' },
  { id: 'REPROGRAMADO', nombre: 'Reprogramado' },
];


export type AppCollections = {
  clientes: RxCollection<ClienteDocType>;
  garrafas: RxCollection<GarrafaDocType>;
  pedidos: RxCollection<PedidoDocType>;
};

export type AppDatabase = RxDatabase<AppCollections>;

@Injectable({ providedIn: 'root' })
export class RxDatabaseService {
  private injector = inject(Injector);
  private _db!: AppDatabase;

  private static pluginsListos = false;

  get db(): AppDatabase {
    return this._db;
  }

  get clientes(): RxCollection<ClienteDocType> {
    return this._db.clientes;
  }

  get garrafas(): RxCollection<GarrafaDocType> {
    return this._db.garrafas;
  }

  get pedidos(): RxCollection<PedidoDocType> {
    return this._db.pedidos;
  }

  /**
   * Inicializa la base de datos RxDB.
   * Debe ser llamado desde APP_INITIALIZER para que la DB esté lista
   * antes de que arranquen los componentes.
   */
  async init(): Promise<void> {
    if (this._db) return;

    if (!RxDatabaseService.pluginsListos) {
      addRxPlugin(RxDBMigrationSchemaPlugin);
      if (!environment.production) {
        addRxPlugin(RxDBDevModePlugin);
      }
      RxDatabaseService.pluginsListos = true;
    }

    // Borrar la base Dexie vieja si existía
    await this.limpiarDexieAntigua();

    const baseStorage = getRxStorageDexie();
    const storage = !environment.production
      ? wrappedValidateAjvStorage({ storage: baseStorage })
      : baseStorage;

    // Nota: el nombre cambia a "-v2" porque el modelo de datos se modifico
    // (el pedido ahora referencia clienteId y existe la coleccion `clientes`).
    // Con un nombre nuevo se crea una base limpia y se evita el conflicto de
    // esquema de RxDB; los datos se re-obtienen del backend via replicacion.
    this._db = await createRxDatabase<AppCollections>({
      name: 'distribuidora-gas-rxdb-v2',
      storage,
      ignoreDuplicate: true,
    });

    await this._db.addCollections({
      clientes: {
        schema: clienteSchema,
        migrationStrategies: {
          1: (doc) => ({
            ...doc,
            backendId: /^\d+$/.test(doc.id) ? Number(doc.id) : null,
            sincronizado: true,
          }),
        },
      },
      garrafas: { schema: garrafaSchema },
      pedidos: {
        schema: pedidoSchema,
        migrationStrategies: {
          1: (doc) => doc,
        },
      },
    });

    console.log('[RxDatabaseService] Base de datos inicializada con colecciones:', Object.keys(this._db.collections));
  }

  async reinicializar(): Promise<void> {
    if (this._db) {
      try {
        await this._db.close();
      } catch {
      }
    }
    this._db = undefined as unknown as AppDatabase;
    await this.init();
    console.log('[RxDatabaseService] Base de datos reinicializada.');
  }


  private async limpiarDexieAntigua(): Promise<void> {

    try {
      const databases = await indexedDB.databases();
      const obsoletas = databases.filter((db) => {
        const nombre = db.name ?? '';

        return (
          (nombre.includes('distribuidora-gas') && !nombre.includes('-rxdb-v2')) &&
          !nombre.includes('rxdb-dexie--distribuidora-gas-rxdb-v2')
        );
      });
      for (const dexieDb of obsoletas) {
        if (!dexieDb.name) continue;
        const nombreBase = dexieDb.name;
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(nombreBase);
          req.onsuccess = () => {
            console.log(`[RxDatabaseService] Base local antigua eliminada: ${nombreBase}`);
            resolve();
          };
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn(`[RxDatabaseService] Eliminación bloqueada: ${nombreBase}`);
            resolve();
          };
        });
      }
    } catch {
      // indexedDB.databases() puede no estar soportado en todos los browsers
      console.warn('[RxDatabaseService] No se pudo verificar/eliminar la base Dexie antigua.');
    }
  }

  /** Destruye la base de datos (útil para tests) */
  async destroy(): Promise<void> {
    if (this._db && isRxDatabase(this._db)) {
      await this._db.close();
    }
  }
}