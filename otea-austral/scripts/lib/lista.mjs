// Operaciones del dueño sobre la lista de espera cifrada: exportar los correos confirmados y rotar el secreto.
// Las usan `scripts/lista-exportar.mjs`, `scripts/lista-recifrar.mjs` y las pruebas. Corren con el rol dueño
// de la base (la aplicación no puede leer los correos cifrados) y con `WAITLIST_SECRETO`.
import { crearCifradorCorreo } from "./lista-cifrado.mjs";

/** @typedef {{ query: (texto: string, parametros?: unknown[]) => Promise<{ rows: any[] }> }} ClienteSql */

/**
 * Correos de las inscripciones confirmadas (o de todas, con `incluirPendientes`), descifrados y en orden de
 * inscripción. Si alguno no se puede descifrar (clave equivocada o dato alterado) lanza y no devuelve nada: no
 * se entrega una lista a medias.
 *
 * @param {ClienteSql} cliente conexión con el rol dueño
 * @param {string} secreto `WAITLIST_SECRETO`
 * @param {{ incluirPendientes?: boolean }} [opciones]
 * @returns {Promise<{ correo: string, confirmado: Date | null }[]>}
 */
export async function leerCorreos(cliente, secreto, { incluirPendientes = false } = {}) {
  const cifrador = crearCifradorCorreo(secreto);
  const { rows } = incluirPendientes
    ? await cliente.query("select correo_indice, correo_cifrado, confirmado from lista_espera order by creado, correo_indice")
    : await cliente.query(
        "select correo_indice, correo_cifrado, confirmado from lista_espera where confirmado is not null order by creado, correo_indice",
      );
  return rows.map((fila) => ({
    correo: cifrador.descifrar(fila.correo_cifrado, fila.correo_indice),
    confirmado: fila.confirmado,
  }));
}

/**
 * CSV con `correo,confirmado`. Un campo que empiece con `=`, `+`, `-`, `@`, tabulación o retorno de carro se
 * antepone con `'` para que una planilla no lo ejecute como fórmula (inyección de fórmulas en CSV).
 *
 * @param {{ correo: string, confirmado: Date | null }[]} filas
 */
export function aCsv(filas) {
  const celda = (/** @type {string} */ valor) => {
    const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
    return /[",\n\r]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
  };
  return ["correo,confirmado", ...filas.map((f) => `${celda(f.correo)},${f.confirmado ? f.confirmado.toISOString() : ""}`)].join("\n");
}

/**
 * Rota el secreto de la lista: descifra cada correo con el secreto anterior y lo vuelve a cifrar (con su
 * índice nuevo) con el actual, todo en una transacción que bloquea las escrituras. Sin `aplicar` solo
 * comprueba que todo se puede descifrar y deshace.
 *
 * Antes de aplicarlo hay que cerrar la lista (`WAITLIST_MODE=cerrada`) y después desplegar el secreto nuevo:
 * lo que la aplicación guarde con el secreto viejo entre un paso y otro quedaría ilegible con el nuevo.
 *
 * @param {ClienteSql} cliente conexión con el rol dueño (una sola, no un pool)
 * @param {string} secretoAnterior
 * @param {string} secretoNuevo
 * @param {{ aplicar?: boolean }} [opciones]
 * @returns {Promise<{ filas: number, aplicado: boolean }>}
 */
export async function recifrar(cliente, secretoAnterior, secretoNuevo, { aplicar = false } = {}) {
  if (secretoAnterior === secretoNuevo) throw new Error("El secreto nuevo es igual al anterior.");
  const anterior = crearCifradorCorreo(secretoAnterior);
  const nuevo = crearCifradorCorreo(secretoNuevo);
  await cliente.query("begin");
  try {
    await cliente.query("lock table lista_espera in exclusive mode");
    const { rows } = await cliente.query("select correo_indice, correo_cifrado from lista_espera");
    for (const fila of rows) {
      const correo = anterior.descifrar(fila.correo_cifrado, fila.correo_indice);
      if (!aplicar) continue;
      const { indice, cifrado } = nuevo.cifrar(correo);
      await cliente.query("update lista_espera set correo_indice = $1, correo_cifrado = $2 where correo_indice = $3", [
        indice,
        cifrado,
        fila.correo_indice,
      ]);
    }
    await cliente.query(aplicar ? "commit" : "rollback");
    return { filas: rows.length, aplicado: aplicar };
  } catch (error) {
    await cliente.query("rollback").catch(() => {});
    throw error;
  }
}
