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
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { usuarioSchema, UsuarioDocType } from '../schemas/usuario.schema';
import { garrafaSchema, GarrafaDocType } from '../schemas/garrafa.schema';
import { pedidoSchema, PedidoDocType } from '../schemas/pedido.schema';
import { environment } from '../../environments/environment';


export type EstadoPedido = 'PENDIENTE' | 'EN_PROCESO' | 'ENTREGADO' | 'CANCELADO';

export interface EstadoInfo {
  id: EstadoPedido;
  nombre: string;
}

export const ESTADOS: EstadoInfo[] = [
  { id: 'PENDIENTE', nombre: 'Pendiente' },
  { id: 'EN_PROCESO', nombre: 'En proceso' },
  { id: 'ENTREGADO', nombre: 'Entregado' },
  { id: 'CANCELADO', nombre: 'Cancelado' },
];


export type AppCollections = {
  usuarios: RxCollection<UsuarioDocType>;
  garrafas: RxCollection<GarrafaDocType>;
  pedidos: RxCollection<PedidoDocType>;
};

export type AppDatabase = RxDatabase<AppCollections>;

@Injectable({ providedIn: 'root' })
export class RxDatabaseService {
  private injector = inject(Injector);
  private _db!: AppDatabase;

  get db(): AppDatabase {
    return this._db;
  }

  get usuarios(): RxCollection<UsuarioDocType> {
    return this._db.usuarios;
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

    // Activar dev-mode solo en desarrollo para validaciones extra
    if (!environment.production) {
      addRxPlugin(RxDBDevModePlugin);
    }

    // Borrar la base Dexie vieja si existía
    await this.limpiarDexieAntigua();

    const baseStorage = getRxStorageDexie();
    const storage = !environment.production
      ? wrappedValidateAjvStorage({ storage: baseStorage })
      : baseStorage;

    this._db = await createRxDatabase<AppCollections>({
      name: 'distribuidora-gas-rxdb',
      storage,
      ignoreDuplicate: true,
    });

    await this._db.addCollections({
      usuarios: { schema: usuarioSchema },
      garrafas: { schema: garrafaSchema },
      pedidos: { schema: pedidoSchema },
    });

    console.log('[RxDatabaseService] Base de datos inicializada con colecciones:', Object.keys(this._db.collections));
  }

  /** Elimina la base Dexie antigua para evitar conflictos */
  private async limpiarDexieAntigua(): Promise<void> {
    try {
      const databases = await indexedDB.databases();
      const dexieDb = databases.find((db) => db.name === 'distribuidora-gas');
      if (dexieDb) {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase('distribuidora-gas');
          req.onsuccess = () => {
            console.log('[RxDatabaseService] Base Dexie antigua eliminada.');
            resolve();
          };
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn('[RxDatabaseService] Eliminación de Dexie bloqueada.');
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
