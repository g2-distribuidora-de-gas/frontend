import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogoService } from '../../../services/catalogo.service';
import { ApiStockService } from '../../../services/api-stock.service';
import { ToastService } from '../../../services/toast.service';
import { Deposito, TIPO_DEPOSITO_LABELS } from '../../../models/deposito.model';
import { StockItem } from '../../../models/stock.model';
import { nombreEstadoGarrafa } from '../../../models/estado-garrafa.model';
import { nombreGarrafa } from '../../../models/garrafa.model';

interface Vista {
  titulo: string;
  consultadoEn: string;
  items: StockItem[];
}

@Component({
  selector: 'app-admin-stock',
  imports: [FormsModule, DatePipe],
  templateUrl: './stock.html',
})
export class StockAdmin {
  private catalogo = inject(CatalogoService);
  private apiStock = inject(ApiStockService);
  private toast = inject(ToastService);

  protected depositos = toSignal(this.catalogo.depositosActivos$(), { initialValue: [] as Deposito[] });
  protected readonly TIPO_LABELS = TIPO_DEPOSITO_LABELS;
  protected readonly nombreEstado = nombreEstadoGarrafa;
  protected readonly nombreGarrafa = nombreGarrafa;

  protected depositoId = signal<string | null>(null);
  protected cargando = signal(false);
  protected vista = signal<Vista | null>(null);

  protected tipos = computed(() =>
    [...new Set((this.vista()?.items ?? []).map((i) => i.tipoGarrafa))].sort(),
  );
  protected estados = computed(() =>
    [...new Set((this.vista()?.items ?? []).map((i) => i.estado))].sort(),
  );

  protected cantidad(tipo: string, estado: string): number {
    const it = (this.vista()?.items ?? []).find((i) => i.tipoGarrafa === tipo && i.estado === estado);
    return it?.cantidad ?? 0;
  }

  protected totalTipo(tipo: string): number {
    return (this.vista()?.items ?? [])
      .filter((i) => i.tipoGarrafa === tipo)
      .reduce((s, i) => s + i.cantidad, 0);
  }

  protected async consultarDeposito(): Promise<void> {
    const id = this.depositoId();
    if (!id) return;
    const dep = this.depositos().find((d) => d.id === id);
    if (!dep) return;
    if (!navigator.onLine) {
      this.toast.error('La consulta de stock requiere conexión.');
      return;
    }
    this.cargando.set(true);
    try {
      const resp = dep.tipo === 'CAMION'
        ? await this.apiStock.getStockCamion(Number(id))
        : await this.apiStock.getStockDeposito(Number(id));
      this.vista.set({
        titulo: `${resp.deposito.nombre} · ${this.TIPO_LABELS[resp.deposito.tipo]}`,
        consultadoEn: resp.consultadoEn,
        items: resp.stock ?? [],
      });
    } catch (e: any) {
      this.toast.error(e?.message || 'No se pudo consultar el stock.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected async consultarTotal(): Promise<void> {
    if (!navigator.onLine) {
      this.toast.error('La consulta de stock requiere conexión.');
      return;
    }
    this.cargando.set(true);
    try {
      const resp = await this.apiStock.getStockTotal();
      this.depositoId.set(null);
      this.vista.set({
        titulo: `Total del sistema (${resp.depositosIncluidos} depósitos)`,
        consultadoEn: resp.consultadoEn,
        items: resp.stock ?? [],
      });
    } catch (e: any) {
      this.toast.error(e?.message || 'No se pudo consultar el stock total.');
    } finally {
      this.cargando.set(false);
    }
  }
}
