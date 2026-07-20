import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogoService } from '../../../services/catalogo.service';
import { ApiGarrafaService } from '../../../services/api-garrafa.service';
import { ApiMovimientoService } from '../../../services/api-movimiento.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { Deposito, TIPO_DEPOSITO_LABELS } from '../../../models/deposito.model';
import { Garrafa, nombreGarrafa } from '../../../models/garrafa.model';
import { EstadoGarrafa, nombreEstadoGarrafa } from '../../../models/estado-garrafa.model';
import {MovimientoResponse,TIPO_MOVIMIENTO_LABELS,TipoMovimiento} from '../../../models/movimiento.model';

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

@Component({
  selector: 'app-admin-movimientos',
  imports: [FormsModule, DatePipe],
  templateUrl: './movimientos.html',
})
export class MovimientosAdmin implements OnInit {
  private catalogo = inject(CatalogoService);
  private apiGarrafa = inject(ApiGarrafaService);
  private apiMov = inject(ApiMovimientoService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected readonly TIPO_DEP_LABELS = TIPO_DEPOSITO_LABELS;
  protected readonly TIPO_MOV_LABELS = TIPO_MOVIMIENTO_LABELS;
  protected readonly TIPOS_MOV = Object.keys(TIPO_MOVIMIENTO_LABELS) as TipoMovimiento[];
  protected readonly nombreGarrafa = nombreGarrafa;
  protected readonly nombreEstado = nombreEstadoGarrafa;
  protected readonly esSuperAdmin = this.auth.esSuperAdmin;

  protected depositos = toSignal(this.catalogo.depositosActivos$(), { initialValue: [] as Deposito[] });
  protected tipos = toSignal(this.catalogo.garrafasActivas$(), { initialValue: [] as Garrafa[] });
  protected estados = signal<EstadoGarrafa[]>([]);

  protected camiones = computed(() => this.depositos().filter((d) => d.tipo === 'CAMION'));
  protected talleres = computed(() => this.depositos().filter((d) => d.tipo === 'TALLER'));

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

  protected f = signal<Record<string, any>>({});
  protected items = signal<ItemLinea[]>([{ tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);

  protected historial = signal<MovimientoResponse[]>([]);
  protected page = signal(0);
  protected totalPages = signal(0);
  protected cargandoHist = signal(false);
  protected filtroDeposito = signal<number | null>(null);
  protected filtroTipoMov = signal<TipoMovimiento | ''>('');

  async ngOnInit(): Promise<void> {
    try {
      await this.catalogo.refrescarDepositos();
    } catch { /* offline */ }
    try {
      this.estados.set(await this.apiGarrafa.listarEstados());
    } catch { /* offline */ }
    void this.cargarHistorial();
  }

  protected setOp(o: Operacion): void {
    this.op.set(o);
    this.f.set({});
    this.items.set([{ tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);
  }

  protected setCampo(campo: string, valor: any): void {
    this.f.update((f) => ({ ...f, [campo]: valor }));
  }

  protected usaItems = computed(() => this.op() === 'CARGA_CAMION' || this.op() === 'DESCARGA_CAMION');
  protected itemsConEstado = computed(() => this.op() === 'DESCARGA_CAMION');

  protected agregarItem(): void {
    this.items.update((it) => [...it, { tipoGarrafaId: null, estadoGarrafaId: null, cantidad: null }]);
  }

  protected quitarItem(i: number): void {
    this.items.update((it) => it.filter((_, idx) => idx !== i));
  }

  protected setItem(i: number, campo: keyof ItemLinea, valor: any): void {
    this.items.update((it) => it.map((x, idx) => (idx === i ? { ...x, [campo]: Number(valor) } : x)));
  }

  private num(v: any): number | null {
    return v === null || v === '' || v === undefined ? null : Number(v);
  }

  private itemsValidos(conEstado: boolean): any[] | null {
    const rows = this.items()
      .filter((r) => r.tipoGarrafaId && r.cantidad && r.cantidad > 0 && (!conEstado || r.estadoGarrafaId))
      .map((r) => conEstado
        ? { tipoGarrafaId: r.tipoGarrafaId, estadoGarrafaId: r.estadoGarrafaId, cantidad: r.cantidad }
        : { tipoGarrafaId: r.tipoGarrafaId, cantidad: r.cantidad });
    return rows.length ? rows : null;
  }

  protected async ejecutar(): Promise<void> {
    if (!navigator.onLine) {
      this.toast.error('Los movimientos de stock requieren conexión.');
      return;
    }
    const f = this.f();
    this.enviando.set(true);
    try {
      switch (this.op()) {
        case 'TRANSFERENCIA':
          await this.apiMov.transferir({
            depositoOrigenId: this.req(f['depositoOrigenId'], 'depósito origen'),
            depositoDestinoId: this.req(f['depositoDestinoId'], 'depósito destino'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            estadoGarrafaId: this.req(f['estadoGarrafaId'], 'estado'),
            cantidad: this.reqCant(f['cantidad']),
            observaciones: f['observaciones'] || undefined,
          });
          break;
        case 'CARGA_CAMION': {
          const items = this.itemsValidos(false);
          if (!items) throw new Error('Agregá al menos un ítem válido (tipo y cantidad).');
          await this.apiMov.cargarCamion({
            camionId: this.req(f['camionId'], 'camión'),
            depositoCentralId: this.req(f['depositoCentralId'], 'depósito central'),
            items,
            observaciones: f['observaciones'] || undefined,
          });
          break;
        }
        case 'DESCARGA_CAMION': {
          const items = this.itemsValidos(true);
          if (!items) throw new Error('Agregá al menos un ítem válido (tipo, estado y cantidad).');
          await this.apiMov.descargarCamion({
            camionId: this.req(f['camionId'], 'camión'),
            depositoCentralId: this.req(f['depositoCentralId'], 'depósito central'),
            items,
            observaciones: f['observaciones'] || undefined,
          });
          break;
        }
        case 'DEVOLUCION':
          await this.apiMov.registrarDevolucion({
            depositoDestinoId: this.req(f['depositoDestinoId'], 'depósito destino'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            estadoGarrafaId: this.req(f['estadoGarrafaId'], 'estado'),
            cantidad: this.reqCant(f['cantidad']),
            pedidoId: this.num(f['pedidoId']) ?? undefined,
            observaciones: f['observaciones'] || undefined,
          });
          break;
        case 'ROTURA':
          await this.apiMov.registrarRotura({
            depositoId: this.req(f['depositoId'], 'depósito'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            estadoGarrafaId: this.req(f['estadoGarrafaId'], 'estado'),
            cantidad: this.reqCant(f['cantidad']),
            observaciones: this.reqObs(f['observaciones']),
          });
          break;
        case 'REPARACION_INICIO':
          await this.apiMov.iniciarReparacion({
            depositoOrigenId: this.req(f['depositoOrigenId'], 'depósito origen'),
            tallerDestinoId: this.req(f['tallerDestinoId'], 'taller destino'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            estadoOrigenId: this.req(f['estadoOrigenId'], 'estado origen'),
            cantidad: this.reqCant(f['cantidad']),
            observaciones: f['observaciones'] || undefined,
          });
          break;
        case 'REPARACION_FIN':
          await this.apiMov.finalizarReparacion({
            tallerId: this.req(f['tallerId'], 'taller'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            cantidad: this.reqCant(f['cantidad']),
            estadoFinalId: this.req(f['estadoFinalId'], 'estado final'),
            observaciones: f['observaciones'] || undefined,
          });
          break;
        case 'AJUSTE':
          await this.apiMov.ajustar({
            depositoId: this.req(f['depositoId'], 'depósito'),
            tipoGarrafaId: this.req(f['tipoGarrafaId'], 'tipo de garrafa'),
            estadoGarrafaId: this.req(f['estadoGarrafaId'], 'estado'),
            cantidad: this.reqCant(f['cantidad']),
            tipoAjuste: (f['tipoAjuste'] as 'ENTRADA' | 'SALIDA') || 'ENTRADA',
            observaciones: this.reqObs(f['observaciones']),
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

  private req(v: any, nombre: string): number {
    const n = this.num(v);
    if (n == null) throw new Error(`Falta seleccionar: ${nombre}.`);
    return n;
  }
  private reqCant(v: any): number {
    const n = this.num(v);
    if (n == null || n <= 0) throw new Error('La cantidad debe ser mayor a 0.');
    return n;
  }
  private reqObs(v: any): string {
    const s = (v ?? '').toString().trim();
    if (!s) throw new Error('Las observaciones son obligatorias en esta operación.');
    return s;
  }

  protected async cargarHistorial(page = 0): Promise<void> {
    if (!navigator.onLine) return;
    this.cargandoHist.set(true);
    try {
      const resp = await this.apiMov.listarHistorial({
        depositoId: this.filtroDeposito() ?? undefined,
        tipoMovimiento: this.filtroTipoMov() || undefined,
        page,
        size: 20,
      });
      this.historial.set(resp.content);
      this.page.set(resp.page);
      this.totalPages.set(resp.totalPages);
    } catch (e: any) {
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
