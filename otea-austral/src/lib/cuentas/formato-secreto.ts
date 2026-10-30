/** El secreto en grupos de cuatro, para copiarlo a mano si no se puede escanear el código. Módulo sin dependencias: lo usa el navegador. */
export function secretoEnGrupos(secreto: string): string {
  return secreto.replace(/(.{4})/g, "$1 ").trim();
}
