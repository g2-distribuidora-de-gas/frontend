import { Component, OnInit, computed, inject, signal, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiRutaService } from '../../../services/api-ruta.service';
import { ApiUsuarioService } from '../../../services/api-usuario.service';
import { ToastService } from '../../../services/toast.service';
import { UsuarioResponse } from '../../../models/usuario.model';
import {
  ActualizarNotasAdminRequest,
  AgendaRepartidorResponse,
  CONFIRMACION_LABELS,
  ConfirmacionRepartidor,
  ESTADO_RUTA_LABELS,
  EstadoRuta,
} from '../../../models/ruta.model';

@Component({
  selector: 'app-agenda-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './agenda-admin.html',
})
export class AgendaAdmin implements OnInit {
  private apiRuta = inject(ApiRutaService);
  private apiUsuario = inject(ApiUsuarioService);
  private toast = inject(ToastService);
  private zone = inject(NgZone);

  protected readonly CONFIRMACION_LABELS = CONFIRMACION_LABELS;
  protected readonly ESTADO_RUTA_LABELS = ESTADO_RUTA_LABELS;

  protected repartidores = signal<UsuarioResponse[]>([]);
  protected repartidorSeleccionado = signal<number | null>(null);
  protected agenda = signal<AgendaRepartidorResponse[]>([]);

  protected cargando = signal(false);
  protected cargandoRepartidores = signal(true);

  protected desde = signal(this.isoHoy());
  protected hasta = signal(this.isoEn(30));

  protected editandoNotasId = signal<number | null>(null);
  protected notasDraft = signal('');
  protected guardandoNotas = signal(false);

  protected filtroConfirmacion = signal<ConfirmacionRepartidor | ''>('');

  protected agendaFiltrada = computed(() => {
    const f = this.filtroConfirmacion();
    if (!f) return this.agenda();
    return this.agenda().filter((r) => r.confirmacionRepartidor === f);
  });

  protected dias = computed(() => {
    const start = new Date(this.desde() + 'T00:00:00');
    const end = new Date(this.hasta() + 'T00:00:00');
    const days: Date[] = [];
    const maxDays = 60; 
    let count = 0;
    for (let d = new Date(start); d <= end && count < maxDays; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
      count++;
    }
    return days;
  });

  protected matrizAgenda = computed(() => {
    const f = this.filtroConfirmacion();
    let ag = this.agenda();
    if (f) ag = ag.filter((r) => r.confirmacionRepartidor === f);

    let repList = this.repartidores();
    const sel = this.repartidorSeleccionado();
    if (sel !== null) {
       repList = repList.filter(r => r.id === sel);
    }
    
    return repList.map(rep => {
       const rowDays = this.dias().map(d => {
          const iso = d.toISOString().slice(0, 10);
          const turnos = ag.filter(r => r.repartidorId === rep.id && r.fechaReparto === iso);
          return { fechaObj: d, iso, turnos };
       });
       return { repartidor: rep, dias: rowDays };
    });
  });

  ngOnInit(): void {
    void this.cargarRepartidores().then(() => {
      this.zone.run(() => void this.cargarAgenda());
    });
  }

  protected async cargarRepartidores(): Promise<void> {
    this.cargandoRepartidores.set(true);
    try {
      const todos = await this.apiUsuario.listarTodos();
      this.zone.run(() => {
        this.repartidores.set(todos.filter((u) => u.rol === 'REPARTIDOR' && u.activo));
      });
    } catch (e) {
      this.zone.run(() => {
        this.toast.error(this.msgError(e, 'No se pudieron cargar los repartidores.'));
      });
    } finally {
      this.zone.run(() => this.cargandoRepartidores.set(false));
    }
  }

  protected async cargarAgenda(): Promise<void> {
    const id = this.repartidorSeleccionado();
    this.cargando.set(true);
    this.agenda.set([]);
    try {
      let data;
      if (id == null) {
        data = await this.apiRuta.obtenerAgendaGlobal(this.desde(), this.hasta());
      } else {
        data = await this.apiRuta.obtenerAgenda(id, this.desde(), this.hasta());
      }
      this.zone.run(() => this.agenda.set(data));
    } catch (e) {
      this.zone.run(() => this.toast.error(this.msgError(e, 'No se pudo cargar la agenda.')));
    } finally {
      this.zone.run(() => this.cargando.set(false));
    }
  }

  protected seleccionarRepartidor(id: number | null): void {
    this.repartidorSeleccionado.set(id);
    void this.cargarAgenda();
  }

  protected iniciarEdicionNotas(r: AgendaRepartidorResponse): void {
    this.editandoNotasId.set(r.rutaId);
    this.notasDraft.set(r.notasAdmin ?? '');
  }

  protected cancelarEdicionNotas(): void {
    this.editandoNotasId.set(null);
    this.notasDraft.set('');
  }

  protected async guardarNotas(rutaId: number): Promise<void> {
    this.guardandoNotas.set(true);
    try {
      const req: ActualizarNotasAdminRequest = {
        notasAdmin: this.notasDraft().trim() || null,
      };
      const actualizado = await this.apiRuta.actualizarNotasAdmin(rutaId, req);
      this.zone.run(() => {
        this.agenda.update((prev) =>
          prev.map((r) => (r.rutaId === actualizado.rutaId ? actualizado : r)),
        );
        this.toast.exito('Notas guardadas correctamente.');
        this.cancelarEdicionNotas();
      });
    } catch (e) {
      this.zone.run(() => this.toast.error(this.msgError(e, 'No se pudieron guardar las notas.')));
    } finally {
      this.zone.run(() => this.guardandoNotas.set(false));
    }
  }

  protected claseConfirmacion(c: ConfirmacionRepartidor): string {
    switch (c) {
      case 'CONFIRMADO':
        return 'bg-green-100 text-green-700 ring-1 ring-green-300';
      case 'RECHAZADO':
        return 'bg-red-100 text-red-600 ring-1 ring-red-300';
      default:
        return 'bg-amber-100 text-amber-700 ring-1 ring-amber-300';
    }
  }

  protected claseEstado(e: EstadoRuta): string {
    switch (e) {
      case 'EN_CURSO': return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
      case 'COMPLETADA': return 'bg-green-50 text-green-700 ring-1 ring-green-200';
      case 'CANCELADA': return 'bg-red-50 text-red-600 ring-1 ring-red-200';
      case 'REPROGRAMADA': return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200';
      default: return 'bg-brand-50 text-brand-700 ring-1 ring-brand-200';
    }
  }


  private isoHoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isoEn(dias: number): string {
    return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  }

  private msgError(e: unknown, fallback: string): string {
    if (e instanceof HttpErrorResponse) {
      const msg = e.error?.mensaje;
      if (typeof msg === 'string') return msg;
      if (e.status === 0) return 'No se pudo conectar con el servidor.';
    }
    if (e instanceof Error && e.message) return e.message;
    return fallback;
  }
}
