/**
 * Almacenamiento de la lista de espera. Guarda lo mínimo: correo, hash del
 * token de confirmación (nunca el token), fechas y versión del
 * consentimiento. Sin IP ni agente de usuario.
 */
export type RegistroLista = {
  correo: string;
  /** `null` una vez confirmada: el token no se reutiliza. */
  tokenHash: string | null;
  /** Cuándo se envió el último enlace. */
  tokenEmitido: string;
  creado: string;
  versionConsentimiento: string;
  confirmado: string | null;
};

export type NuevaInscripcion = {
  correo: string;
  tokenHash: string;
  /** Instante ISO de la solicitud. */
  ahora: string;
  versionConsentimiento: string;
};

export interface WaitlistStore {
  /**
   * Inscribe el correo. Si ya estaba sin confirmar y su último enlace se
   * envió antes de `reenviarSiAnteriorA`, lo renueva con el token nuevo.
   * `existente`: no cambió nada y no hay que enviar correo.
   */
  guardar(inscripcion: NuevaInscripcion, reenviarSiAnteriorA: string): Promise<"nuevo" | "renovado" | "existente">;
  /** `true` si el token correspondía a una inscripción pendiente emitida desde `vigenteDesde`. */
  confirmar(tokenHash: string, ahora: string, vigenteDesde: string): Promise<boolean>;
  /** El envío falló: el enlace no vale y se puede pedir otro de inmediato. */
  liberarReenvio(correo: string): Promise<void>;
  /** Borra las inscripciones sin confirmar cuyo último enlace es anterior a `antesDe`. */
  purgarPendientes(antesDe: string): Promise<number>;
}

const ANULADO = new Date(0).toISOString();

/** Solo para desarrollo y pruebas: se pierde al reiniciar el servidor. */
export function createMemoryWaitlistStore(): WaitlistStore & { registros(): readonly RegistroLista[] } {
  const porCorreo = new Map<string, RegistroLista>();
  return {
    async guardar(r, reenviarSiAnteriorA) {
      const previo = porCorreo.get(r.correo);
      if (!previo) {
        porCorreo.set(r.correo, {
          correo: r.correo,
          tokenHash: r.tokenHash,
          tokenEmitido: r.ahora,
          creado: r.ahora,
          versionConsentimiento: r.versionConsentimiento,
          confirmado: null,
        });
        return "nuevo";
      }
      if (previo.confirmado !== null || previo.tokenEmitido >= reenviarSiAnteriorA) return "existente";
      previo.tokenHash = r.tokenHash;
      previo.tokenEmitido = r.ahora;
      previo.versionConsentimiento = r.versionConsentimiento;
      return "renovado";
    },
    async confirmar(tokenHash, ahora, vigenteDesde) {
      for (const registro of porCorreo.values()) {
        if (registro.tokenHash === tokenHash && registro.confirmado === null) {
          if (registro.tokenEmitido < vigenteDesde) return false;
          registro.confirmado = ahora;
          registro.tokenHash = null;
          return true;
        }
      }
      return false;
    },
    async liberarReenvio(correo) {
      const registro = porCorreo.get(correo);
      if (registro && registro.confirmado === null) registro.tokenEmitido = ANULADO;
    },
    async purgarPendientes(antesDe) {
      let borrados = 0;
      for (const [correo, registro] of porCorreo) {
        if (registro.confirmado === null && registro.tokenEmitido < antesDe) {
          porCorreo.delete(correo);
          borrados += 1;
        }
      }
      return borrados;
    },
    registros() {
      return [...porCorreo.values()].map((r) => ({ ...r }));
    },
  };
}
