import { Routes } from '@angular/router';
import { guestGuard, roleGuard, homeRedirectGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
    title: 'Iniciar sesión | Distribuidora de Gas',
  },
  {
    path: 'toma-pedido',
    canActivate: [roleGuard('PREVENTISTA')],
    loadComponent: () => import('./pages/toma-pedido/toma-pedido').then((m) => m.TomaPedido),
    title: 'Nuevo pedido | Distribuidora de Gas',
  },
  {
    path: 'pedidos',
    canActivate: [roleGuard('PREVENTISTA', 'ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/pedidos/pedidos').then((m) => m.Pedidos),
    title: 'Pedidos | Distribuidora de Gas',
  },
  {
    path: 'reparto',
    canActivate: [roleGuard('REPARTIDOR')],
    loadComponent: () => import('./pages/reparto/reparto').then((m) => m.Reparto),
    title: 'Mi reparto | Distribuidora de Gas',
  },
  {
    path: 'admin/usuarios',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/usuarios/usuarios').then((m) => m.Usuarios),
    title: 'Usuarios | Distribuidora de Gas',
  },
  {
    path: 'admin/clientes',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/clientes/clientes').then((m) => m.ClientesAdmin),
    title: 'Clientes | Distribuidora de Gas',
  },
    {
    path: 'admin/garrafas',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/garrafas/garrafas').then((m) => m.GarrafasAdmin),
    title: 'Garrafas | Distribuidora de Gas',
  },
  {
    path: 'admin/depositos',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/depositos/depositos').then((m) => m.DepositosAdmin),
    title: 'Depósitos | Distribuidora de Gas',
  },
  {
    path: 'admin/stock',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/stock/stock').then((m) => m.StockAdmin),
    title: 'Stock | Distribuidora de Gas',
  },
  {
    path: 'admin/movimientos',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/movimientos/movimientos').then((m) => m.MovimientosAdmin),
    title: 'Movimientos | Distribuidora de Gas',
  },
  {
    path: 'admin/rutas',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/rutas/rutas').then((m) => m.RutasAdmin),
    title: 'Planificar rutas | Distribuidora de Gas',
  },
  {
    path: 'admin/agenda',
    canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')],
    loadComponent: () => import('./pages/admin/agenda/agenda-admin').then((m) => m.AgendaAdmin),
    title: 'Agenda repartidores | Distribuidora de Gas',
  },

  { path: '**', redirectTo: '' },
];
