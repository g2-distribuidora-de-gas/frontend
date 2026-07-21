export const MAX_CANTIDAD = 100_000;
export const MAX_CAPACIDAD_KG = 1_000;
export const MAX_PRECIO = 100_000_000;
export const MAX_NOMBRE = 30;
export const MAX_DESCRIPCION = 100;
export const MAX_OBSERVACIONES = 100;
export const MAX_CODIGO = 20;

export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function esEntero(v: unknown): boolean {
  const n = aNumero(v);
  return n !== null && Number.isInteger(n);
}

export function esEnteroPositivo(v: unknown): boolean {
  const n = aNumero(v);
  return n !== null && Number.isInteger(n) && n > 0;
}

export function esNoNegativo(v: unknown): boolean {
  const n = aNumero(v);
  return n !== null && n >= 0;
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizarCantidad(v: unknown, max = MAX_CANTIDAD): number {
  const n = aNumero(v);
  if (n === null) return 0;
  return clamp(Math.floor(Math.abs(n)), 0, max);
}


export function validarCantidad(
  v: unknown,
  disponible: number | null = null,
  etiqueta = 'La cantidad',
): string | null {
  const n = aNumero(v);
  if (n === null) return `${etiqueta} es obligatoria.`;
  if (n < 0) return `${etiqueta} no puede ser negativa.`;
  if (!Number.isInteger(n)) return `${etiqueta} debe ser un número entero (no se permiten decimales).`;
  if (n === 0) return `${etiqueta} debe ser mayor a 0.`;
  if (n > MAX_CANTIDAD) return `${etiqueta} no puede superar ${MAX_CANTIDAD.toLocaleString('es-AR')} unidades.`;
  if (disponible !== null && n > disponible) {
    return disponible === 0
      ? 'No hay stock disponible para esa combinación de depósito, tipo y estado.'
      : `Solo hay ${disponible} unidad(es) disponibles y estás intentando mover ${n}.`;
  }
  return null;
}


const TECLAS_NO_ENTERAS = ['.', ',', 'e', 'E', '-', '+'];

export function bloquearNoEnteros(e: KeyboardEvent): void {
  if (TECLAS_NO_ENTERAS.includes(e.key)) e.preventDefault();
}

export function bloquearNegativos(e: KeyboardEvent): void {
  if (['e', 'E', '-', '+'].includes(e.key)) e.preventDefault();
}

export function soloDigitos(e: KeyboardEvent): void {
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/\d/.test(e.key)) e.preventDefault();
}

export function sinDigitos(e: KeyboardEvent): void {
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /\d/.test(e.key)) e.preventDefault();
}

export function digitosPegados(e: ClipboardEvent, max = 10): string {
  return (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, max);
}

export function limpiarTexto(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim();
}


export function validarTexto(
  v: string | null | undefined,
  etiqueta: string,
  { min = 1, max = MAX_DESCRIPCION, obligatorio = true } = {},
): string | null {
  const s = limpiarTexto(v);
  if (!s) return obligatorio ? `${etiqueta} es obligatorio/a.` : null;
  if (s.length < min) return `${etiqueta} debe tener al menos ${min} caracteres.`;
  if (s.length > max) return `${etiqueta} no puede superar los ${max} caracteres.`;
  return null;
}


export function normalizarComparacion(v: string | null | undefined): string {
  return limpiarTexto(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function validarCodigo(v: string | null | undefined): string | null {
  const s = limpiarTexto(v).toUpperCase();
  if (!s) return 'El código es obligatorio.';
  if (s.length > MAX_CODIGO) return `El código no puede superar los ${MAX_CODIGO} caracteres.`;
  if (!/^[A-Z0-9_-]+$/.test(s)) {
    return 'El código solo admite letras, números, guion y guion bajo (ej: 10KG).';
  }
  if (!/[A-Z0-9]/.test(s)) return 'El código debe contener al menos una letra o número.';
  return null;
}

export function validarPatente(v: string | null | undefined): string | null {
  const s = normalizarPatente(v);
  if (!s) return null; // opcional
  if (!/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(s)) {
    return 'La patente debe tener formato AAA123 o AA123AA.';
  }
  return null;
}

export function normalizarPatente(v: string | null | undefined): string {
  return (v ?? '').replace(/[\s-]/g, '').toUpperCase().slice(0, 7);
}

export function validarEmail(v: string | null | undefined): string | null {
  const s = limpiarTexto(v);
  if (!s) return 'El email es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'El email no tiene un formato válido.';
  return null;
}

export function validarTelefono(v: string | null | undefined, obligatorio = false): string | null {
  const s = (v ?? '').replace(/\D/g, '');
  if (!s) return obligatorio ? 'El teléfono es obligatorio.' : null;
  if (!/^\d{8,10}$/.test(s)) return 'El teléfono debe tener entre 8 y 10 dígitos.';
  return null;
}
