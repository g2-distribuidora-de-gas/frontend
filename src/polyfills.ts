
if (typeof window !== 'undefined') {
  (window as unknown as { global: typeof globalThis }).global = window;
}

(globalThis as unknown as { global: typeof globalThis }).global =
  globalThis;

export {};
