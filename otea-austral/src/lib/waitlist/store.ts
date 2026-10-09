/**
 * Almacenamiento de la lista de espera. Guarda lo mínimo: correo, hash del
 * token de confirmación (nunca el token), fecha y versión del
 * consentimiento. Sin IP ni agente de usuario.
 */
export type RegistroLista = {
  correo: string;
  tokenHash: string;
  creado: string;
  versionConsentimiento: string;
  confirmado: boolean;
};

export interface WaitlistStore {
  /** `existente` si el correo ya estaba: no se sobrescribe nada. */
  guardar(registro: Omit<RegistroLista, "confirmado">): Promise<"nuevo" | "existente">;
  /** `true` si el token correspondía a una inscripción pendiente. */
  confirmar(tokenHash: string): Promise<boolean>;
}

/** Solo para desarrollo y pruebas: se pierde al reiniciar el servidor. */
export function createMemoryWaitlistStore(): WaitlistStore & { registros(): readonly RegistroLista[] } {
  const porCorreo = new Map<string, RegistroLista>();
  const porToken = new Map<string, RegistroLista>();
  return {
    async guardar(r) {
      if (porCorreo.has(r.correo)) return "existente";
      const registro = { ...r, confirmado: false };
      porCorreo.set(r.correo, registro);
      porToken.set(r.tokenHash, registro);
      return "nuevo";
    },
    async confirmar(tokenHash) {
      const registro = porToken.get(tokenHash);
      if (!registro || registro.confirmado) return false;
      registro.confirmado = true;
      porToken.delete(tokenHash);
      return true;
    },
    registros() {
      return [...porCorreo.values()].map((r) => ({ ...r }));
    },
  };
}
