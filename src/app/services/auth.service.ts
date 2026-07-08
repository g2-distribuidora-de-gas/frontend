import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, AuthUser, LoginRequest } from '../models/auth.model';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly _token = signal<string | null>(this.leerToken());
  private readonly _usuario = signal<AuthUser | null>(this.leerUsuario());


  readonly usuario = this._usuario.asReadonly();

  readonly autenticado = computed(() => this._token() !== null);


  async login(credenciales: LoginRequest): Promise<AuthUser> {
    const resp = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', credenciales),
    );

    const usuario: AuthUser = {
      userId: resp.userId,
      email: resp.email,
      nombreCompleto: resp.nombreCompleto,
      rol: resp.rol,
    };

    localStorage.setItem(TOKEN_KEY, resp.token);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    this._token.set(resp.token);
    this._usuario.set(usuario);

    return usuario;
  }


  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._usuario.set(null);
  }


  get token(): string | null {
    return this._token();
  }

  private leerToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private leerUsuario(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
