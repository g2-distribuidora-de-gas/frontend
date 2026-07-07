export type RolUsuario = 'PREVENTISTA' | 'REPARTIDOR' | 'ADMIN' | 'SUPER_ADMIN';


export interface LoginRequest {
  email: string;
  password: string;
}


export interface AuthResponse {
  token: string;
  tipo: string;
  userId: number;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
}


export interface AuthUser {
  userId: number;
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
}
