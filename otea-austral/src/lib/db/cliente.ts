import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { logSecurityEvent } from "@/lib/security/log";

export type Fila = QueryResultRow;

/** Ejecuta consultas parametrizadas: el texto SQL nunca lleva datos de entrada. */
export interface Consultor {
  consulta<T extends Fila = Fila>(texto: string, parametros?: readonly unknown[]): Promise<T[]>;
}

export interface BaseDeDatos extends Consultor {
  /** Ejecuta `fn` en una transacción: confirma si termina, revierte si lanza. */
  transaccion<T>(fn: (tx: Consultor) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

const OID_DATE = 1082;

// Las fechas de calendario llegan como texto `AAAA-MM-DD`: convertirlas a
// Date las correría según la zona horaria del servidor.
const tiposPropios = {
  getTypeParser: ((oid: number, formato?: "text" | "binary") =>
    oid === OID_DATE && formato !== "binary"
      ? (valor: string) => valor
      : types.getTypeParser(oid, formato)) as typeof types.getTypeParser,
};

/** Código SQLSTATE de un error de Postgres (por ejemplo `23505`), si lo hay. */
export function codigoError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

type Opciones = {
  /** Conexiones simultáneas por instancia (Neon gratuito: pocas). */
  max?: number;
  nombreAplicacion?: string;
};

/**
 * Pool de conexiones a Postgres. La cadena de conexión define el usuario
 * (de mínimos privilegios) y el cifrado (`sslmode=verify-full` en
 * producción, lo exige el esquema de entorno).
 */
export function crearBaseDeDatos(url: string, { max = 5, nombreAplicacion = "otea-austral" }: Opciones = {}): BaseDeDatos {
  const pool = new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    application_name: nombreAplicacion,
    types: tiposPropios,
  });
  // Una conexión ociosa que se cae no debe tumbar el proceso: el pool la reemplaza.
  pool.on("error", (error) => {
    logSecurityEvent({ tipo: "fallo_servicio", servicio: "base_de_datos", codigo: codigoError(error) ?? "conexion" });
  });

  async function consultar<T extends Fila>(
    cliente: Pool | PoolClient,
    texto: string,
    parametros?: readonly unknown[],
  ): Promise<T[]> {
    const r = await cliente.query<T>(texto, parametros ? [...parametros] : undefined);
    return r.rows;
  }

  return {
    consulta: (texto, parametros) => consultar(pool, texto, parametros),

    async transaccion(fn) {
      const cliente = await pool.connect();
      let rota = false;
      try {
        await cliente.query("begin");
        const resultado = await fn({ consulta: (texto, parametros) => consultar(cliente, texto, parametros) });
        await cliente.query("commit");
        return resultado;
      } catch (error) {
        await cliente.query("rollback").catch(() => {
          rota = true;
        });
        throw error;
      } finally {
        // Si ni siquiera se pudo revertir, la conexión se descarta.
        cliente.release(rota);
      }
    },

    cerrar: () => pool.end(),
  };
}
