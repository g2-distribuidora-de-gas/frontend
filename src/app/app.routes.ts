import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'toma-pedido' },
  {
    path: 'toma-pedido',
    loadComponent: () => import('./pages/toma-pedido/toma-pedido').then((m) => m.TomaPedido),
    title: 'Nuevo pedido | Distribuidora de Gas',
  },
  {
    path: 'pedidos',
    loadComponent: () => import('./pages/pedidos/pedidos').then((m) => m.Pedidos),
    title: 'Pedidos | Distribuidora de Gas',
  },
  { path: '**', redirectTo: 'toma-pedido' },
];
