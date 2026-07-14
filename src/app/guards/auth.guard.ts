import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RolUsuario } from '../models/auth.model';


export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.autenticado()) {
    return true;
  }
  return router.createUrlTree([auth.rutaInicial()]);
};

export const roleGuard = (...roles: RolUsuario[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.autenticado()) {
      return router.createUrlTree(['/login']);
    }
    if (auth.tieneRol(...roles)) {
      return true;
    }
    return router.createUrlTree([auth.rutaInicial()]);
  };
};


export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.autenticado()) {
    return router.createUrlTree(['/login']);
  }
  return router.createUrlTree([auth.rutaInicial()]);
};
