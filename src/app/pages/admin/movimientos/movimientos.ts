import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogoService } from '../../../services/catalogo.service';
import { ApiGarrafaService } from '../../../services/api-garrafa.service';
import { ApiMovimientoService } from '../../../services/api-movimiento.service';
import { ApiStockService } from '../../../services/api-stock.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { Deposito, TIPO_DEPOSITO_LABELS } from '../../../models/deposito.model';
import { Garrafa, nombreGarrafa } from '../../../models/garrafa.model';
import { EstadoGarrafa, nombreEstadoGarrafa } from '../../../models/estado-garrafa.model';
import { MovimientoResponse, TIPO_MOVIMIENTO_LABELS, TipoMovimiento } from '../../../models/movimiento.model';
import { StockItem } from '../../../models/stock.model';
import {MAX_CANTIDAD,MAX_OBSERVACIONES,aNumero,bloquearNoEnteros,esEnteroPositivo,limpiarTexto,normalizarCantidad,validarCantidad} from '../../../utils/validaciones';

type Operacion =
  | 'TRANSFERENCIA'
  | 'CARGA_CAMION'
  | 'DESCARGA_CAMION'
  | 'DEVOLUCION'
  | 'ROTURA'
  | 'REPARACION_INICIO'
  | 'REPARACION_FIN'
  | 'AJUSTE';

interface ItemLinea {
  tipoGarrafaId: number | null;
  estadoGarrafaId: number | null;
  cantidad: number | null;
}
const ESTADOS_FIN_REPARACION = ['LLENA', 'VACIA', 'FUERA_SERVICIO'];

@Component({
  selector: 'app-admin-movimientos',
  imports: [FormsModule, DatePipe],
  templateUrl: './movimientos.html',
})
export class MovimientosAdmin implements OnInit {
  private catalogo = inject(CatalogoService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiMov = inject(ApiMovimientoService);
  private apiStock = inject(ApiStockService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected readonly TIPO_DEP_LABELS = TIPO_DEPOSITO_LABELS;
  protected readonly TIPO_MOV_LABELS = TIPO_MOVIMIENTO_LABELS;
  protected readonly TIPOS_MOV = Object.keys(TIPO_MOVIMIENTO_LABELS) as TipoMovimiento[];
  protected readonly nombreGarrafa = nombreGarrafa;
  protected readonly nombreEstado = nombreEstadoGarrafa;
  protected readonly esSuperAdmin = this.auth.esSuperAdmin;
  protected readonly MAX_CANTIDAD = MAX_CANTIDAD;
  protected readonly MAX_OBSERVACIONES = MAX_OBSERVACIONES;
  protected readonly bloquearNoEnteros = bloquearNoEnteros;

  protected depositos = toSignal(this.catalogo.depositosActivos$(), { initialValue: [] as Deposito[] });
  protected tipos = toSignal(this.catalogo.garrafasActivas$(), { initialValue: [] as Garrafa[] });
  protected estados = signal<EstadoGarrafa[]>([]);

  protected camiones = computed(() => this.depositos().filter((d) => d.tipo === 'CAMION'));
  protected talleres = computed(() => this.depositos().filter((d) => d.tipo === 'TALLER'));
  protected centrales = computed(() =>
    this.depositos().filter((d) => d.tipo !== 'CAMION' && d.tipo !== 'TALLER'),
  );
  protected estadosFinReparacion = computed(() =>
    this.estados().filter((e) => ESTADOS_FIN_REPARACION.includes(e.codigo)),
  );

  protected readonly OPERACIONES: { id: Operacion; label: string }[] = [
    { id: 'TRANSFERENCIA', label: 'Transferencia' },
    { id: 'CARGA_CAMION', label: 'Cargar camión' },
    { id: 'DESCARGA_CAMION', label: 'Descargar camión' },
    { id: 'DEVOLUCION', label: 'Devolución' },
    { id: 'ROTURA', label: 'Rotura' },
    { id: 'REPARACION_INICIO', label: 'Enviar a reparación' },
    { id: 'REPARACION_FIN', label: 'Retornar de reparación' },
    { id: 'AJUSTE', label: 'Ajuste' },
  ];

  protected op = signal<Operacion>('TRANSFERENCIA');
  protected enviando = signal(false);
  protected tocado = signal(false);

  protected f = signal<Record<string, any>>({});
  protected items = signal<ItemLinea[]>([{ tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);

  protected idOrigen = computed<number | null>(() => {
    const f = this.f();
    switch (this.op()) {
      case 'TRANSFERENCIA': return aNumero(f['depositoOrigenId']);
      case 'CARGA_CAMION': return aNumero(f['depositoCentralId']);
      case 'DESCARGA_CAMION': return aNumero(f['camionId']);
      case 'ROTURA': return aNumero(f['depositoId']);
      case 'AJUSTE': return aNumero(f['depositoId']);
      case 'REPARACION_INICIO': return aNumero(f['depositoOrigenId']);
      case 'REPARACION_FIN': return aNumero(f['tallerId']);
      default: return null;
    }
  });

  protected idDestino = computed<number | null>(() => {
    const f = this.f();
    switch (this.op()) {
      case 'TRANSFERENCIA': return aNumero(f['depositoDestinoId']);
      case 'CARGA_CAMION': return aNumero(f['camionId']);
      case 'DESCARGA_CAMION': return aNumero(f['depositoCentralId']);
      case 'DEVOLUCION': return aNumero(f['depositoDestinoId']);
      case 'REPARACION_INICIO': return aNumero(f['tallerDestinoId']);
      default: return null;
    }
  });

  protected stockOrigen = signal<StockItem[] | null>(null);
  protected stockDestino = signal<StockItem[] | null>(null);
  protected cargandoStockO = signal(false);
  protected cargandoStockD = signal(false);
  protected stockNoDisponible = signal(false);

  constructor() {
    effect(() => {
      const id = this.idOrigen();
      if (id != null) {
        this.cargandoStockO.set(true);
        this.getStockParaId(id).then((s) => {
          this.stockOrigen.set(s);
          this.stockNoDisponible.set(s === null);
          this.cargandoStockO.set(false);
        });
      } else {
        this.stockOrigen.set(null);
        this.stockNoDisponible.set(false);
      }
    });

    effect(() => {
      const id = this.idDestino();
      if (id != null) {
        this.cargandoStockD.set(true);
        this.getStockParaId(id).then((s) => {
          this.stockDestino.set(s);
          this.cargandoStockD.set(false);
        });
      } else {
        this.stockDestino.set(null);
      }
    });
  }

  private async getStockParaId(id: number | string): Promise<StockItem[] | null> {
    const dep = this.depositos().find((d) => String(d.id) === String(id));
    if (!dep) return null;
    if (!navigator.onLine) return null;
    try {
      const res = dep.tipo === 'CAMION'
        ? await this.apiStock.getStockCamion(Number(id))
        : await this.apiStock.getStockDeposito(Number(id));
      return res.stock ?? [];
    } catch {
      return null;
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.catalogo.refrescarDepositos();
    } catch { /* offline */ }
    try {
      this.estados.set(await this.apiGarrafa.listarEstados());
    } catch { /* offline */ }
    void this.cargarHistorial();
  }

  protected usaItems = computed(() => this.op() === 'CARGA_CAMION' || this.op() === 'DESCARGA_CAMION');
  protected itemsConEstado = computed(() => this.op() === 'DESCARGA_CAMION');

  protected totalGarrafas = computed(() =>
    this.items().reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0),
  );

  protected topeAplica = computed(() => {
    if (this.op() === 'AJUSTE') return this.f()['tipoAjuste'] === 'SALIDA';
    return this.idOrigen() != null;
  });

  protected estadoOrigenId = computed<number | null>(() => {
    const f = this.f();
    switch (this.op()) {
      case 'TRANSFERENCIA':
      case 'ROTURA':
      case 'AJUSTE':
        return aNumero(f['estadoGarrafaId']);
      case 'REPARACION_INICIO':
        return aNumero(f['estadoOrigenId']);
      case 'REPARACION_FIN':
        return this.estados().find((e) => e.codigo === 'REPARACION')?.id ?? null;
      default:
        return null;
    }
  });

  protected nombreDeposito(id: number | null): string {
    if (id == null) return '';
    return this.depositos().find((d) => Number(d.id) === id)?.nombre ?? `#${id}`;
  }

  private codigoTipo(id: number | null): string | null {
    if (id == null) return null;
    return this.tipos().find((t) => Number(t.id) === id)?.codigo ?? null;
  }

  private codigoEstado(id: number | null): string | null {
    if (id == null) return null;
    return this.estados().find((e) => e.id === id)?.codigo ?? null;
  }

  protected disponible(tipoGarrafaId: number | null, estadoGarrafaId: number | null): number | null {
    if (!this.topeAplica()) return null;
    const lista = this.stockOrigen();
    if (lista == null || tipoGarrafaId == null) return null;
    const codTipo = this.codigoTipo(tipoGarrafaId);
    if (!codTipo) return null;
    const codEstado = this.codigoEstado(estadoGarrafaId);
    return lista
      .filter((i) => i.tipoGarrafa === codTipo && (codEstado == null || i.estado === codEstado))
      .reduce((s, i) => s + i.cantidad, 0);
  }

  protected disponibleActual = computed<number | null>(() =>
    this.disponible(aNumero(this.f()['tipoGarrafaId']), this.estadoOrigenId()),
  );

  protected maxCantidad = computed<number>(() => {
    const d = this.disponibleActual();
    return d == null ? MAX_CANTIDAD : Math.min(d, MAX_CANTIDAD);
  });

  protected disponibleItem(it: ItemLinea): number | null {
    return this.disponible(it.tipoGarrafaId, this.itemsConEstado() ? it.estadoGarrafaId : null);
  }

  protected excedeCantidad = computed(() => {
    const d = this.disponibleActual();
    const c = aNumero(this.f()['cantidad']);
    return d != null && c != null && c > d;
  });

  protected setOp(o: Operacion): void {
    this.op.set(o);
    this.f.set(o === 'AJUSTE' ? { tipoAjuste: 'ENTRADA' } : {});
    this.items.set([{ tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);
    this.tocado.set(false);
    this.stockNoDisponible.set(false);
  }

  protected setCampo(campo: string, valor: any): void {
    this.tocado.set(true);
    let v = valor;
    if (campo === 'cantidad') v = valor === '' || valor === null ? null : normalizarCantidad(valor);
    if (campo === 'pedidoId') v = valor === '' || valor === null ? null : normalizarCantidad(valor);
    if (campo === 'observaciones') v = String(valor ?? '').slice(0, MAX_OBSERVACIONES);
    this.f.update((f) => ({ ...f, [campo]: v }));
  }

  protected agregarItem(): void {
    this.items.update((it) => [...it, { tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);
  }

  protected quitarItem(i: number): void {
    this.items.update((it) => (it.length === 1 ? it : it.filter((_, idx) => idx !== i)));
  }

  protected setItem(i: number, campo: keyof ItemLinea, valor: any): void {
    this.tocado.set(true);
    const v =
      campo === 'cantidad'
        ? (valor === '' || valor === null ? null : normalizarCantidad(valor))
        : aNumero(valor);
    this.items.update((it) => it.map((x, idx) => (idx === i ? { ...x, [campo]: v } : x)));
  }

  protected errorItem(it: ItemLinea, i: number): string | null {
    if (it.tipoGarrafaId == null && it.cantidad == null) return null;
    if (it.tipoGarrafaId == null) return 'Elegí el tipo de garrafa.';
    if (this.itemsConEstado() && it.estadoGarrafaId == null) return 'Elegí el estado.';
    const dup = this.items().findIndex(
      (x, idx) =>
        idx !== i &&
        x.tipoGarrafaId === it.tipoGarrafaId &&
        (!this.itemsConEstado() || x.estadoGarrafaId === it.estadoGarrafaId),
    );
    if (dup !== -1 && dup < i) return 'Este tipo/estado ya está cargado en otra línea.';
    return validarCantidad(it.cantidad, this.disponibleItem(it));
  }

  protected error = computed<string | null>(() => {
    const f = this.f();
    const op = this.op();

    const falta = (campo: string, nombre: string): string | null =>
      aNumero(f[campo]) == null ? `Falta seleccionar: ${nombre}.` : null;

    if (op === 'TRANSFERENCIA') {
      const e = falta('depositoOrigenId', 'depósito origen') ?? falta('depositoDestinoId', 'depósito destino');
      if (e) return e;
      if (aNumero(f['depositoOrigenId']) === aNumero(f['depositoDestinoId'])) {
        return 'El depósito de origen y el de destino no pueden ser el mismo.';
      }
    }

    if (op === 'CARGA_CAMION' || op === 'DESCARGA_CAMION') {
      const e = falta('camionId', 'camión') ?? falta('depositoCentralId', 'depósito central');
      if (e) return e;
    }

    if (op === 'DEVOLUCION') {
      const e = falta('depositoDestinoId', 'depósito destino');
      if (e) return e;
      if (f['pedidoId'] != null && f['pedidoId'] !== '' && !esEnteroPositivo(f['pedidoId'])) {
        return 'El ID de pedido debe ser un número entero mayor a 0.';
      }
    }

    if (op === 'ROTURA' || op === 'AJUSTE') {
      const e = falta('depositoId', 'depósito');
      if (e) return e;
    }

    if (op === 'REPARACION_INICIO') {
      const e = falta('depositoOrigenId', 'depósito origen') ?? falta('tallerDestinoId', 'taller destino');
      if (e) return e;
      if (aNumero(f['depositoOrigenId']) === aNumero(f['tallerDestinoId'])) {
        return 'El taller de destino no puede ser el mismo depósito de origen.';
      }
    }

    if (op === 'REPARACION_FIN') {
      const e = falta('tallerId', 'taller') ?? falta('estadoFinalId', 'estado final');
      if (e) return e;
      const cod = this.codigoEstado(aNumero(f['estadoFinalId']));
      if (cod && !ESTADOS_FIN_REPARACION.includes(cod)) {
        return 'Al salir del taller la garrafa solo puede quedar Llena, Vacía o Fuera de servicio.';
      }
    }

    if (op === 'AJUSTE') {
      if (!this.esSuperAdmin()) return 'Los ajustes de inventario requieren rol SUPER_ADMIN.';
      if (f['tipoAjuste'] !== 'ENTRADA' && f['tipoAjuste'] !== 'SALIDA') {
        return 'Elegí si el ajuste es de entrada o de salida.';
      }
    }

    if (this.usaItems()) {
      const filas = this.items();
      const cargadas = filas.filter((r) => r.tipoGarrafaId != null || r.cantidad != null);
      if (cargadas.length === 0) return 'Agregá al menos un ítem con tipo y cantidad.';
      for (let i = 0; i < filas.length; i++) {
        const e = this.errorItem(filas[i], i);
        if (e) return `Ítem ${i + 1}: ${e}`;
      }
    } else {
      const e = falta('tipoGarrafaId', 'tipo de garrafa');
      if (e) return e;
      if (op === 'TRANSFERENCIA' || op === 'DEVOLUCION' || op === 'ROTURA' || op === 'AJUSTE') {
        const e2 = falta('estadoGarrafaId', 'estado');
        if (e2) return e2;
      }
      if (op === 'REPARACION_INICIO') {
        const e2 = falta('estadoOrigenId', 'estado origen');
        if (e2) return e2;
      }
      if (op === 'ROTURA' && this.codigoEstado(aNumero(f['estadoGarrafaId'])) === 'FUERA_SERVICIO') {
        return 'Una garrafa fuera de servicio no puede volver a registrarse como rota.';
      }
      const eCant = validarCantidad(f['cantidad'], this.disponibleActual());
      if (eCant) return eCant;
    }

    if (op === 'ROTURA' || op === 'AJUSTE') {
      if (!limpiarTexto(f['observaciones'])) {
        return 'Las observaciones son obligatorias en esta operación.';
      }
    }
    if (limpiarTexto(f['observaciones']).length > MAX_OBSERVACIONES) {
      return `Las observaciones no pueden superar los ${MAX_OBSERVACIONES} caracteres.`;
    }

    return null;
  });

  protected puedeEnviar = computed(() => this.error() == null && !this.enviando());


  protected resumenOp = computed(() => {
    const op = this.op();
    const f = this.f();
    const cantForm = Number(f['cantidad']) || 0;
    const total = this.usaItems() ? this.totalGarrafas() : cantForm;
    if (!total) return null;

    const getDep = (id: any) => this.depositos().find((d) => String(d.id) === String(id))?.nombre || '...';

    switch (op) {
      case 'TRANSFERENCIA':
        return `Vas a transferir ${total} garrafas de ${getDep(f['depositoOrigenId'])} a ${getDep(f['depositoDestinoId'])}.`;
      case 'CARGA_CAMION':
        return `Vas a cargar ${total} garrafas desde ${getDep(f['depositoCentralId'])} al camión ${getDep(f['camionId'])}.`;
      case 'DESCARGA_CAMION':
        return `Vas a descargar ${total} garrafas del camión ${getDep(f['camionId'])} en ${getDep(f['depositoCentralId'])}.`;
      case 'DEVOLUCION':
        return `Vas a registrar la devolución de ${total} garrafas en ${getDep(f['depositoDestinoId'])}.`;
      case 'ROTURA':
        return `Vas a reportar ${total} garrafas rotas en ${getDep(f['depositoId'])}.`;
      case 'REPARACION_INICIO':
        return `Vas a enviar ${total} garrafas a reparar desde ${getDep(f['depositoOrigenId'])} al taller ${getDep(f['tallerDestinoId'])}.`;
      case 'REPARACION_FIN':
        return `Vas a retornar ${total} garrafas reparadas desde el taller ${getDep(f['tallerId'])}.`;
      case 'AJUSTE':
        return `Vas a hacer un ajuste de ${f['tipoAjuste'] === 'SALIDA' ? 'salida (-)' : 'entrada (+)'} de ${total} garrafas en ${getDep(f['depositoId'])}.`;
      default:
        return null;
    }
  });

  protected getBadgeColor(tipo: TipoMovimiento): string {
    switch (tipo) {
      case 'AJUSTE_ENTRADA':
      case 'DEVOLUCION':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'AJUSTE_SALIDA':
      case 'ROTURA':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'TRANSFERENCIA':
      case 'CARGA_CAMION':
      case 'DESCARGA_CAMION':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'REPARACION_INICIO':
      case 'REPARACION_FIN':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  protected historial = signal<MovimientoResponse[]>([]);
  protected page = signal(0);
  protected totalPages = signal(0);
  protected cargandoHist = signal(false);
  protected filtroDeposito = signal<number | null>(null);
  protected filtroTipoMov = signal<TipoMovimiento | ''>('');

  private itemsPayload(conEstado: boolean): any[] {
    return this.items()
      .filter((r) => r.tipoGarrafaId != null && r.cantidad != null && r.cantidad > 0)
      .map((r) => conEstado
        ? { tipoGarrafaId: r.tipoGarrafaId, estadoGarrafaId: r.estadoGarrafaId, cantidad: r.cantidad }
        : { tipoGarrafaId: r.tipoGarrafaId, cantidad: r.cantidad });
  }

  protected async ejecutar(): Promise<void> {
    if (this.enviando()) return;
    if (!navigator.onLine) {
      this.toast.error('Los movimientos de stock requieren conexión.');
      return;
    }
    this.tocado.set(true);
    const error = this.error();
    if (error) {
      this.toast.error(error);
      return;
    }
    const f = this.f();
    const obs = limpiarTexto(f['observaciones']);
    this.enviando.set(true);
    try {
      switch (this.op()) {
        case 'TRANSFERENCIA':
          await this.apiMov.transferir({
            depositoOrigenId: Number(f['depositoOrigenId']),
            depositoDestinoId: Number(f['depositoDestinoId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            estadoGarrafaId: Number(f['estadoGarrafaId']),
            cantidad: Number(f['cantidad']),
            observaciones: obs || undefined,
          });
          break;
        case 'CARGA_CAMION':
          await this.apiMov.cargarCamion({
            camionId: Number(f['camionId']),
            depositoCentralId: Number(f['depositoCentralId']),
            items: this.itemsPayload(false),
            observaciones: obs || undefined,
          });
          break;
        case 'DESCARGA_CAMION':
          await this.apiMov.descargarCamion({
            camionId: Number(f['camionId']),
            depositoCentralId: Number(f['depositoCentralId']),
            items: this.itemsPayload(true),
            observaciones: obs || undefined,
          });
          break;
        case 'DEVOLUCION':
          await this.apiMov.registrarDevolucion({
            depositoDestinoId: Number(f['depositoDestinoId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            estadoGarrafaId: Number(f['estadoGarrafaId']),
            cantidad: Number(f['cantidad']),
            pedidoId: aNumero(f['pedidoId']) ?? undefined,
            observaciones: obs || undefined,
          });
          break;
        case 'ROTURA':
          await this.apiMov.registrarRotura({
            depositoId: Number(f['depositoId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            estadoGarrafaId: Number(f['estadoGarrafaId']),
            cantidad: Number(f['cantidad']),
            observaciones: obs,
          });
          break;
        case 'REPARACION_INICIO':
          await this.apiMov.iniciarReparacion({
            depositoOrigenId: Number(f['depositoOrigenId']),
            tallerDestinoId: Number(f['tallerDestinoId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            estadoOrigenId: Number(f['estadoOrigenId']),
            cantidad: Number(f['cantidad']),
            observaciones: obs || undefined,
          });
          break;
        case 'REPARACION_FIN':
          await this.apiMov.finalizarReparacion({
            tallerId: Number(f['tallerId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            cantidad: Number(f['cantidad']),
            estadoFinalId: Number(f['estadoFinalId']),
            observaciones: obs || undefined,
          });
          break;
        case 'AJUSTE':
          await this.apiMov.ajustar({
            depositoId: Number(f['depositoId']),
            tipoGarrafaId: Number(f['tipoGarrafaId']),
            estadoGarrafaId: Number(f['estadoGarrafaId']),
            cantidad: Number(f['cantidad']),
            tipoAjuste: f['tipoAjuste'] as 'ENTRADA' | 'SALIDA',
            observaciones: obs,
          });
          break;
      }
      this.toast.exito('Movimiento registrado.');
      this.setOp(this.op());
      void this.cargarHistorial();
    } catch (e: any) {
      this.toast.error(e?.message || 'No se pudo registrar el movimiento.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async cargarHistorial(page = 0): Promise<void> {
    if (!navigator.onLine) return;
    this.cargandoHist.set(true);
    try {
      const resp = await this.apiMov.listarHistorial({
        depositoId: this.filtroDeposito() ?? undefined,
        tipoMovimiento: this.filtroTipoMov() || undefined,
        page: Math.max(0, page),
        size: 20,
      });
      this.historial.set(resp.content);
      this.page.set(resp.page);
      this.totalPages.set(resp.totalPages);
    } catch {
      this.historial.set([]);
    } finally {
      this.cargandoHist.set(false);
    }
  }

  protected paginaAnterior(): void {
    if (this.page() > 0) void this.cargarHistorial(this.page() - 1);
  }
  protected paginaSiguiente(): void {
    if (this.page() + 1 < this.totalPages()) void this.cargarHistorial(this.page() + 1);
  }

  protected depNombre(d?: { nombre: string } | null): string {
    return d?.nombre ?? '—';
  }
}
