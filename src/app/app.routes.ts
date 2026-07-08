import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'toma-pedido' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
    title: 'Iniciar sesión | Distribuidora de Gas',
  },
  {
    path: 'toma-pedido',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/toma-pedido/toma-pedido').then((m) => m.TomaPedido),
    title: 'Nuevo pedido | Distribuidora de Gas',
  },
  {
    path: 'pedidos',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pedidos/pedidos').then((m) => m.Pedidos),
    title: 'Pedidos | Distribuidora de Gas',
  },
  { path: '**', redirectTo: 'toma-pedido' },
];
