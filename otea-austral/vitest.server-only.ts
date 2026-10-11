// `server-only` lanza al importarse fuera de un Server Component (para que el build falle si un
// componente de navegador lo importa). En Vitest no hay esa frontera: se reemplaza por un módulo vacío.
export {};
