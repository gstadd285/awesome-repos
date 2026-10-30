/**
 * Guardas de arquitectura: leen el código fuente y fallan si alguien rompe, sin querer, una regla de
 * seguridad del proyecto. No sustituyen a una revisión: convierten reglas escritas en CLAUDE.md en
 * comprobaciones automáticas (plan de los 20 controles, `docs/seguridad/plan-20-controles.md`).
 *
 * Cuando una de estas pruebas falla porque agregaste algo a propósito (una ruta, una acción, un archivo
 * en `public/`), no la silencies: revisa la superficie nueva, documéntala y actualiza el inventario.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { TEMAS } from "@/lib/domain/temas";
import { buildCsp } from "./csp";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

function archivos(directorio: string, filtro: (ruta: string) => boolean): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(directorio)) {
    const ruta = path.join(directorio, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, filtro));
    else if (filtro(ruta)) salida.push(ruta);
  }
  return salida.sort();
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");
const leer = (ruta: string) => readFileSync(ruta, "utf8");
const esPrueba = (ruta: string) => /\.(test|spec)\.[tj]sx?$/.test(ruta);
const fuentes = archivos(SRC, (r) => /\.(ts|tsx)$/.test(r) && !esPrueba(r));

/** Cuerpo de cada función asíncrona exportada, hasta la llave que la cierra. */
function funcionesExportadas(texto: string): { nombre: string; cuerpo: string }[] {
  const salida: { nombre: string; cuerpo: string }[] = [];
  for (const m of texto.matchAll(/export async function (\w+)\s*\(/g)) {
    const inicio = texto.indexOf("{", texto.indexOf(")", m.index) + 1);
    let nivel = 0;
    let fin = inicio;
    for (let i = inicio; i < texto.length; i++) {
      if (texto[i] === "{") nivel++;
      if (texto[i] === "}" && --nivel === 0) {
        fin = i;
        break;
      }
    }
    salida.push({ nombre: m[1], cuerpo: texto.slice(inicio, fin) });
  }
  return salida;
}

describe("consultas SQL (control 13: parametrizar)", () => {
  /** Plantillas con `${…}` que además parecen SQL. */
  const PARECE_SQL = /\b(select\s[\s\S]*\sfrom|insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i;
  const PLANTILLA = /`([^`\\]|\\.)*`/g;

  it("el texto SQL solo interpola constantes SQL_…; los datos van como $1, $2…", () => {
    const infractores: string[] = [];
    for (const ruta of fuentes) {
      // El ayudante de pruebas crea bases y roles con identificadores que él mismo genera.
      if (relativa(ruta) === "src/lib/db/prueba-postgres.ts") continue;
      for (const plantilla of leer(ruta).match(PLANTILLA) ?? []) {
        if (!PARECE_SQL.test(plantilla)) continue;
        for (const m of plantilla.matchAll(/\$\{([^}]*)\}/g)) {
          if (!/^SQL_[A-Z_]+$/.test(m[1].trim())) infractores.push(`${relativa(ruta)}: \${${m[1]}}`);
        }
      }
    }
    expect(infractores).toEqual([]);
  });

  it("no se arma SQL concatenando cadenas", () => {
    const infractores: string[] = [];
    for (const ruta of fuentes) {
      if (relativa(ruta) === "src/lib/db/prueba-postgres.ts") continue;
      const texto = leer(ruta);
      for (const m of texto.matchAll(/["'](\s*(?:select|insert|update|delete)\b[^"'\n]*)["']\s*\+/gi)) {
        infractores.push(`${relativa(ruta)}: ${m[1].slice(0, 40)}…`);
      }
    }
    expect(infractores).toEqual([]);
  });

  it("toda consulta recibe sus datos como parámetros (la API de consulta no admite otra cosa)", () => {
    // `consulta(texto, parametros)` pasa por `pool.query(texto, valores)` del protocolo extendido de
    // Postgres: una sola sentencia por llamada, con los valores aparte.
    const cliente = leer(path.join(SRC, "lib/db/cliente.ts"));
    expect(cliente).toMatch(/cliente\.query<T>\(texto, parametros \? \[\.\.\.parametros\] : undefined\)/);
  });
});

describe("frontera entre el servidor y el navegador (controles 1 y 3)", () => {
  const PROHIBIDO_EN_CLIENTE =
    /^(pg|server-only|node:.+|@\/lib\/env|@\/lib\/db(\/.*)?|@\/lib\/admin\/(acceso|almacen|sesion|clave|totp)|@\/lib\/alertas\/(repositorio|instancia|formulario|visibles)|@\/lib\/waitlist\/(instance|store|store-postgres|service|correo)|@\/lib\/asistente\/(?!limites$|cliente$).+|@\/lib\/cuentas\/(?!formato-secreto$).+|@\/lib\/correo\/.+|@\/lib\/ingesta\/.+|@\/lib\/tareas\/.+|@\/lib\/borradores\/.+|@\/lib\/ia\/.+)$/;

  const clientes = fuentes.filter((r) => /^\s*["']use client["'];?/.test(leer(r)));

  it("hay componentes de cliente (la prueba vigila algo)", () => {
    expect(clientes.map(relativa)).toContain("src/components/home/WaitlistForm.tsx");
  });

  it("ningún componente de cliente importa la base, la configuración ni los módulos del servidor", () => {
    const infractores: string[] = [];
    for (const ruta of clientes) {
      for (const m of leer(ruta).matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
        if (m[1]) continue; // `import type` se borra al compilar: no entra al paquete del navegador.
        if (PROHIBIDO_EN_CLIENTE.test(m[2])) infractores.push(`${relativa(ruta)} → ${m[2]}`);
      }
    }
    expect(infractores).toEqual([]);
  });

  it("los módulos con secretos o conexiones dicen `server-only`", () => {
    for (const modulo of [
      "lib/env.ts",
      "lib/db/cliente.ts",
      "lib/db/instancia.ts",
      "lib/admin/acceso.ts",
      "lib/ingesta/descarga.ts",
      "lib/ingesta/instancia.ts",
      "lib/tareas/exigir.ts",
      "lib/borradores/proveedor-borrador.ts",
      "lib/borradores/instancia.ts",
    ]) {
      expect(leer(path.join(SRC, modulo)), modulo).toMatch(/^import "server-only";/m);
    }
  });

  it("la única variable de entorno que llega al navegador es la URL pública del sitio", () => {
    const publicas = new Set<string>();
    for (const ruta of fuentes) {
      for (const m of leer(ruta).matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+/g)) publicas.add(m[0]);
    }
    expect([...publicas]).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });
});

describe("asistente de preguntas (IA de pago)", () => {
  const delAsistente = fuentes.filter((r) => relativa(r).startsWith("src/lib/asistente/"));
  const proveedor = leer(path.join(SRC, "lib/asistente/proveedor-anthropic.ts"));

  it("hay código del asistente (la prueba vigila algo)", () => {
    expect(delAsistente.length).toBeGreaterThan(10);
  });

  it("solo los dos proveedores importan el SDK: el del asistente y el de los borradores (un lugar por servicio de pago)", () => {
    const usuarios = fuentes.filter((r) => /["']@anthropic-ai\/sdk/.test(leer(r))).map(relativa);
    expect(usuarios).toEqual(["src/lib/asistente/proveedor-anthropic.ts", "src/lib/borradores/proveedor-borrador.ts"]);
    expect(proveedor).toMatch(/^import "server-only";/m);
  });

  it("el cliente del SDK recibe la clave, la URL y el token de forma explícita: no lee nada del entorno por su cuenta", () => {
    expect(proveedor).toMatch(/apiKey,/);
    expect(proveedor).toMatch(/authToken: null/);
    expect(proveedor).toMatch(/webhookKey: null/);
    expect(proveedor).toMatch(/baseURL = URL_API_ANTHROPIC/); // nunca `undefined`: el SDK lo leería del entorno
    expect(proveedor).toMatch(/logLevel: "off"/); // ni la pregunta ni la respuesta en los registros del servidor
    expect(proveedor).toMatch(/maxRetries: 1/); // cada reintento es otra llamada que se paga
  });

  it("nada del asistente hace peticiones por su cuenta ni lee el entorno ni escribe en la consola", () => {
    const infractores: string[] = [];
    for (const ruta of delAsistente) {
      const texto = leer(ruta);
      if (/\bfetch\(|XMLHttpRequest|\bWebSocket\b|node:(http|https|net|child_process)/.test(texto)) {
        infractores.push(`${relativa(ruta)}: peticiones`);
      }
      if (/process\.env/.test(texto)) infractores.push(`${relativa(ruta)}: process.env`);
      if (/\bconsole\./.test(texto)) infractores.push(`${relativa(ruta)}: console`);
    }
    expect(infractores).toEqual([]);
  });

  it("lo único que se anota de una pregunta es su categoría, nunca el texto ni quién la hizo", () => {
    const instancia = leer(path.join(SRC, "lib/asistente/instancia.ts"));
    const registro = /function registrar\(registro: Registro\): void \{[\s\S]*?\n\}/.exec(instancia)?.[0] ?? "";
    expect(registro).toContain("registro.resultado");
    expect(registro).not.toMatch(/\b(pregunta|anteriores|clave|ip)\b/i);
    expect(leer(path.join(SRC, "lib/asistente/servicio.ts"))).not.toMatch(/registrar\([^)]*(pregunta|texto|clave)/);
  });

  it("la ruta del asistente solo acepta POST y no lee ni cookies ni cabeceras por su cuenta", () => {
    const ruta = leer(path.join(SRC, "app/api/asistente/route.ts"));
    expect([...ruta.matchAll(/export (?:async )?function ([A-Z]+)/g)].map((m) => m[1])).toEqual(["POST"]);
    expect(ruta).not.toMatch(/cookies\(|headers\(/);
  });

  it("el modo base es el de arranque: la IA exige activarse a propósito", () => {
    expect(leer(path.join(SRC, "lib/env.ts"))).toMatch(/ASISTENTE_MODO: z\.enum\(\["base", "ia"\]\)\.default\("base"\)/);
  });
});

describe("autenticación del panel (control 6)", () => {
  const acciones = fuentes.filter((r) => relativa(r).startsWith("src/app/admin/") && r.endsWith("acciones.ts"));
  const paginas = fuentes.filter((r) => relativa(r).startsWith("src/app/admin/") && /\/(page|layout)\.tsx$/.test(r));
  /** El inicio de sesión es la única acción que, por definición, se ejecuta sin sesión. */
  const SIN_SESION = new Set(["iniciarSesion"]);

  it("hay acciones y páginas del panel (la prueba vigila algo)", () => {
    expect(acciones.length).toBeGreaterThanOrEqual(2);
    expect(paginas.length).toBeGreaterThanOrEqual(4);
  });

  it("toda Server Action del panel exige sesión y token CSRF (o pasa por `ejecutar`, que lo exige)", () => {
    const infractores: string[] = [];
    for (const ruta of acciones) {
      const texto = leer(ruta);
      const usaEjecutar = /\bejecutar\(/.test(texto);
      if (usaEjecutar) {
        const definicion = /async function ejecutar\([\s\S]*?\n}\n/.exec(texto)?.[0] ?? "";
        if (!/exigirAccionAdmin\(/.test(definicion)) infractores.push(`${relativa(ruta)}: «ejecutar» no exige sesión`);
      }
      for (const { nombre, cuerpo } of funcionesExportadas(texto)) {
        if (SIN_SESION.has(nombre)) continue;
        if (!/\b(exigirAccionAdmin|ejecutar)\(/.test(cuerpo)) infractores.push(`${relativa(ruta)}: ${nombre}`);
      }
    }
    expect(infractores).toEqual([]);
  });

  it("toda página y diseño del panel comprueba la sesión en el servidor", () => {
    const infractores = paginas.filter((r) => !/\b(exigirSesion|sesionActual)\(/.test(leer(r))).map(relativa);
    expect(infractores).toEqual([]);
  });

  it("las páginas privadas del panel usan `exigirSesion` (redirige al acceso), no solo `sesionActual`", () => {
    const privadas = paginas.filter((r) => /^src\/app\/admin\/(alertas|eventos|invitaciones)\//.test(relativa(r)) && r.endsWith("page.tsx"));
    expect(privadas.map(relativa)).toEqual(
      expect.arrayContaining(["src/app/admin/eventos/page.tsx", "src/app/admin/eventos/[id]/page.tsx", "src/app/admin/invitaciones/page.tsx"]),
    );
    expect(privadas.length).toBeGreaterThanOrEqual(6);
    for (const ruta of privadas) expect(leer(ruta), relativa(ruta)).toMatch(/\bexigirSesion\(/);
  });

  it("el tablero de /admin solo se muestra con sesión: sin ella, el formulario de acceso", () => {
    const inicio = leer(path.join(SRC, "app/admin/page.tsx"));
    const antesDelTablero = inicio.slice(0, inicio.indexOf("cola.tablero("));
    expect(antesDelTablero).toMatch(/const sesion = await sesionActual\(\);\n\s*if \(!sesion\) \{[\s\S]*?return \(/);
  });
});

describe("cola de eventos candidatos (docs/alertas-reales.md §3 y §5)", () => {
  const acciones = leer(path.join(SRC, "app/admin/eventos/acciones.ts"));
  const cola = leer(path.join(SRC, "lib/ingesta/cola-postgres.ts"));

  it("las acciones de la cola exigen sesión y CSRF antes de leer el formulario o tocar la base", () => {
    const exportadas = funcionesExportadas(acciones);
    expect(exportadas.map((f) => f.nombre).sort()).toEqual([
      "aceptarBorradorAccion",
      "crearAlertaDesdeEventoAccion",
      "descartarBorradorAccion",
      "descartarEventoAccion",
      "pedirBorradorAccion",
    ]);
    for (const { nombre, cuerpo } of exportadas) {
      expect(cuerpo.replace(/^\{/, "").trim().split("\n")[0], nombre).toBe("const sesion = await exigirAccionAdmin(datos);");
    }
  });

  it("una alerta creada desde un evento nunca es de ejemplo y sus fuentes salen de la base, no del formulario", () => {
    expect(cola).toMatch(/crearConFuentes\(\{ \.\.\.datos, es_ejemplo: false \}/);
    expect(acciones).not.toMatch(/es_ejemplo: (true|datos)/);
    // Del formulario solo llegan los ids de los ítems; título, enlace y fechas se leen de `fuente_items`.
    expect(acciones).not.toMatch(/getAll\("(url|titulo|titulo_documento)"\)/);
    expect(cola).toMatch(/where i\.evento_id = \$1 and i\.id = any\(\$2::uuid\[\]\)/);
  });

  it("nada de la agrupación, de la cola ni del panel llama a una IA: del módulo de borradores solo leen el esquema", () => {
    const deLaCola = fuentes.filter((r) => /^src\/(lib\/ingesta|app\/admin|components\/admin)\//.test(relativa(r)));
    expect(deLaCola.length).toBeGreaterThanOrEqual(10);
    const infractores = deLaCola
      .filter((r) => /@anthropic-ai|@\/lib\/asistente|@\/lib\/borradores\/(?!esquema["'])/.test(leer(r)))
      .map(relativa);
    expect(infractores).toEqual([]);
    // La redacción la arma solo la ruta de la tarea (servicio privado `otea-tareas`), nunca una página ni una acción.
    expect(fuentes.filter((r) => /redactorBorradores\(/.test(leer(r))).map(relativa).sort()).toEqual([
      "src/app/api/tareas/ingesta/route.ts",
      "src/lib/borradores/instancia.ts",
    ]);
  });

  it("aceptar un borrador crea la alerta por el mismo camino que la manual: crearConFuentes, nunca de ejemplo, con el borrador en la transacción", () => {
    expect(acciones).toMatch(/cola\.crearAlerta\(alertas, leerTexto\(datos, "evento_id"\), nueva\.valor, leerItems\(datos\), contextoAdmin\(sesion\), \{\n\s*borradorId,/);
    // El borrador se marca aceptado dentro de `vincular`, en la transacción que crea la alerta.
    const vincular = /async function vincular\([\s\S]*?\n  \}\n/.exec(cola)?.[0] ?? "";
    expect(vincular).toMatch(/update borradores set estado = 'aceptado'/);
    expect(vincular).toMatch(/estado = 'pendiente' returning 1/);
  });

  it("en el panel, todo enlace que abre otra pestaña lleva rel=\"noopener noreferrer\" y un href pasado por safeHref", () => {
    const delPanel = fuentes.filter((r) => /^src\/(app\/admin|components\/admin)\//.test(relativa(r)) && r.endsWith(".tsx"));
    let enlaces = 0;
    for (const ruta of delPanel) {
      for (const m of leer(ruta).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
        enlaces++;
        expect(m[0], relativa(ruta)).toMatch(/rel="noopener noreferrer"/);
        expect(m[0], relativa(ruta)).toMatch(/href=\{href\}/);
        expect(leer(ruta), relativa(ruta)).toMatch(/const href = safeHref\(/);
      }
    }
    expect(enlaces).toBeGreaterThanOrEqual(2);
  });
});

describe("borradores con IA (docs/alertas-reales.md §4 y §8.4)", () => {
  const proveedor = leer(path.join(SRC, "lib/borradores/proveedor-borrador.ts"));
  const deBorradores = fuentes.filter((r) => relativa(r).startsWith("src/lib/borradores/"));
  const configuracion = leer(path.join(SRC, "lib/env.ts"));

  it("hay código de los borradores (la prueba vigila algo)", () => {
    expect(deBorradores.length).toBeGreaterThanOrEqual(9);
  });

  it("el cliente del SDK recibe todo explícito: clave, URL y token; un reintento, sin registros", () => {
    expect(proveedor).toMatch(/apiKey,\n\s*authToken: null,\n\s*webhookKey: null,\n\s*baseURL,\n\s*maxRetries: 1,/);
    expect(proveedor).toMatch(/baseURL = URL_API_ANTHROPIC/); // nunca `undefined`: el SDK lo leería del entorno
    expect(proveedor).toMatch(/logLevel: "off"/);
    // Un solo cliente (también para `countTokens`, que solo usa la prueba con la API real).
    expect(proveedor.match(/new Anthropic\(/g)).toHaveLength(1);
  });

  it("la solicitud no lleva herramientas, pensamiento explícito, muestreo ni relleno: salida estructurada con esfuerzo bajo", () => {
    const solicitud = /cliente\.messages\.create\(\n\s*\{([\s\S]*?)\n\s*\},\n\s*\{ signal: senal \}/.exec(proveedor)?.[1] ?? "";
    expect(solicitud).toMatch(/output_config: \{ effort: "low", format: formato \}/);
    expect(solicitud).toMatch(/messages: \[\{ role: "user", content: mensaje \}\]/);
    expect(proveedor).not.toMatch(/\b(tools|tool_choice|mcp_servers|thinking|temperature|top_p|top_k)\s*:/);
    expect(proveedor).not.toMatch(/role: "assistant"/);
    expect(proveedor).toMatch(/zodOutputFormat\(BorradorModeloSchema\)/);
  });

  it("solo el proveedor llama al modelo; nada de los borradores registra textos (solo resultado y código)", () => {
    const llamadas = deBorradores.filter((r) => /\.messages\.(create|parse|stream|countTokens)\(/.test(leer(r))).map(relativa);
    expect(llamadas).toEqual(["src/lib/borradores/proveedor-borrador.ts"]);
    for (const ruta of deBorradores) {
      for (const m of leer(ruta).matchAll(/registrar\(\{[^}]*\}/g)) {
        expect(m[0], relativa(ruta)).not.toMatch(/\b(texto|titulo|url|mensaje|contenido|borrador:)/);
      }
    }
  });

  it("los borradores nacen apagados, solo en el servicio de tareas, con tope ≤ US$ 5 y la dirección de pruebas con OTEA_E2E=1", () => {
    expect(configuracion).toMatch(/BORRADORES_MODO: z\.enum\(\["apagado", "ia"\]\)\.default\("apagado"\)/);
    expect(configuracion).toMatch(/TOPE_MENSUAL_BORRADORES_MAXIMO_USD = 5;/);
    expect(configuracion).toMatch(/BORRADORES_TOPE_MENSUAL_USD: z\.coerce\.number\(\)\.positive\(\)\.max\(TOPE_MENSUAL_BORRADORES_MAXIMO_USD\)\.optional\(\)/);
    expect(configuracion).toMatch(/if \(e\.TAREAS_MODO !== "activo"\) \{\n\s*problema\(\n\s*"BORRADORES_MODO"/);
    expect(configuracion).toMatch(/e\.BORRADORES_URL_API_PRUEBA && e\.OTEA_E2E !== "1"/);
    expect(leer(path.join(SRC, "lib/borradores/instancia.ts"))).toMatch(/env\.OTEA_E2E === "1" \? env\.BORRADORES_URL_API_PRUEBA : undefined/);
    // El techo también en la reserva y en la base.
    expect(leer(path.join(SRC, "lib/borradores/presupuesto-postgres.ts"))).toMatch(/least\(\$2::bigint, 5000000\)/);
    expect(leer(path.join(RAIZ, "db/migraciones/0010_borradores.sql"))).toMatch(/tope_micros bigint not null check \(tope_micros between 1 and 5000000\)/);
  });

  it("la lectura del texto de las fuentes pasa por descarga.ts y por lectura_ia, y nunca se guarda", () => {
    const lectura = leer(path.join(SRC, "lib/borradores/lectura.ts"));
    expect(lectura).toMatch(/!permiteLecturaIa\(fuente\)/);
    expect(lectura).toMatch(/clase: "documento"/);
    // Ninguna columna para el texto: el almacén no tiene dónde ponerlo.
    const almacen = leer(path.join(SRC, "lib/borradores/almacen-postgres.ts"));
    expect(almacen).not.toMatch(/\b(texto|documento_texto|cuerpo)\b\s*[,)]/);
  });
});

describe("acceso privado por invitación (docs/alertas-reales.md §6 y §8.4)", () => {
  const acciones = leer(path.join(SRC, "app/admin/invitaciones/acciones.ts"));
  const servicio = leer(path.join(SRC, "lib/cuentas/invitaciones.ts"));
  const paginaAlertas = leer(path.join(SRC, "app/alertas/page.tsx"));

  it("las acciones de invitaciones exigen sesión del panel y CSRF antes de leer el formulario o tocar la base", () => {
    const exportadas = funcionesExportadas(acciones);
    expect(exportadas.map((f) => f.nombre).sort()).toEqual(["emitirInvitacionAccion", "revocarInvitacionAccion"]);
    for (const { nombre, cuerpo } of exportadas) {
      expect(cuerpo.replace(/^\{/, "").trim().split("\n")[0], nombre).toBe("const sesion = await exigirAccionAdmin(datos);");
    }
  });

  it("del código de una invitación solo llega al almacén su HMAC; el almacén no tiene dónde guardarlo en claro", () => {
    expect(servicio).toMatch(/codigoHash: cifrador\.hashInvitacion\(normalizarCodigoInvitacion\(codigo\)\)/);
    const almacen = leer(path.join(SRC, "lib/cuentas/almacen.ts"));
    const emitir = /emitirInvitacion\(e: \{([\s\S]*?)\}\)/.exec(almacen)?.[1] ?? "";
    expect(emitir).toMatch(/codigoHash: string/);
    expect(emitir).not.toMatch(/\bcodigo:/);
    const sql = leer(path.join(RAIZ, "db/migraciones/0009_invitaciones.sql"));
    expect(sql).not.toMatch(/^\s+codigo\s/m);
  });

  it("solo `alertasVisibles` pide lo publicado al repositorio, y /alertas decide con la sesión de la cuenta", () => {
    const llamadas = fuentes.filter((r) => /\.publicas\(/.test(leer(r))).map(relativa);
    expect(llamadas).toEqual(["src/lib/alertas/visibles.ts"]);
    expect(paginaAlertas).toMatch(/const sesion = await sesionCuenta\(\);\n\s*const visibles = await alertasVisibles\(sesion, repositorioAlertas\(\)\);/);
    expect(paginaAlertas).not.toMatch(/repositorioAlertas\(\)\.|repo\.publicas/);
  });

  it("sin sesión nada real se filtra por los costados: metadatos fijos, mapa del sitio fijo, imagen OG estática y sin RSS", () => {
    expect(paginaAlertas).toMatch(/export const metadata: Metadata = \{/);
    expect(paginaAlertas).not.toMatch(/generateMetadata|generateStaticParams|revalidate\s*=/);
    for (const archivo of ["app/sitemap.ts", "app/robots.ts", "app/manifest.ts"]) {
      expect(leer(path.join(SRC, archivo)), archivo).not.toMatch(/@\/lib\/(alertas|db|cuentas)|@\/data\/ejemplo/);
    }
    const app = archivos(path.join(SRC, "app"), () => true).map(relativa);
    // La imagen OG es un archivo fijo, no una ruta que arme la imagen con datos; no hay feeds RSS ni Atom.
    expect(app.filter((r) => /opengraph-image|twitter-image/.test(r))).toEqual(["src/app/opengraph-image.alt.txt", "src/app/opengraph-image.jpg"]);
    expect(app.filter((r) => /\b(rss|atom|feed)\b/i.test(r))).toEqual([]);
  });
});

describe("aportes por Mercado Pago: solo un enlace hacia afuera (docs/despliegue.md §15)", () => {
  const pagina = leer(path.join(SRC, "app/apoyar/page.tsx"));
  const configuracion = leer(path.join(SRC, "lib/env.ts"));

  it("nacen apagados: DONACIONES_URL no tiene valor por omisión y se valida contra la lista cerrada al arrancar", () => {
    expect(configuracion).toMatch(/DONACIONES_URL: linkDonaciones\.optional\(\),/);
    expect(configuracion).toMatch(/\(v\) => enlaceDonacion\(v\) !== null/);
    expect(configuracion).toMatch(/DONACIONES_URL: leer\("DONACIONES_URL"\)/);
  });

  it("sin el apartado activo /apoyar responde 404 antes de dibujar nada, también en sus metadatos", () => {
    expect(pagina).not.toMatch(/export const metadata/);
    expect(pagina).toMatch(/export function generateMetadata\(\): Metadata \{\n\s*if \(!donacionesActivas\(\)\) notFound\(\);/);
    const cuerpo = /export default function ApoyarPage\(\) \{\n([\s\S]*?)\n\s*return \(/.exec(pagina)?.[1] ?? "";
    expect(cuerpo.trim().split("\n")).toEqual([
      "const enlace = enlaceDonaciones();",
      "  const href = enlace ? safeHref(enlace) : undefined;",
      "  if (!href) notFound();",
    ]);
  });

  it("el único enlace a Mercado Pago abre otra pestaña, con rel=\"noopener noreferrer\" y el href pasado por safeHref", () => {
    const externos = [...pagina.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(externos).toHaveLength(1);
    expect(externos[0]).toMatch(/href=\{href\}/);
    expect(externos[0]).toMatch(/target="_blank"/);
    expect(externos[0]).toMatch(/rel="noopener noreferrer"/);
  });

  it("nada de Mercado Pago se carga en el sitio: sin dominios fuera de la lista, iframes, scripts ni cambios en la CSP", () => {
    const conDominio = fuentes.filter((r) => /mercadopago\.|mpago\./i.test(leer(r))).map(relativa);
    expect(conDominio).toEqual(["src/lib/donaciones/enlace.ts"]);
    const infractores = fuentes.filter((r) => /<iframe|next\/script|<script\s[^>]*src=/i.test(leer(r))).map(relativa);
    expect(infractores).toEqual([]);
    const csp = buildCsp("n", { dev: false });
    expect(csp).not.toMatch(/mercadopago|mpago|frame-src|\*/);
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
  });

  it("los puntos de entrada (pie, menú del teléfono y mapa del sitio) aparecen solo con el apartado activo", () => {
    const conRuta = fuentes.filter((r) => /["']\/apoyar["']/.test(leer(r))).map(relativa);
    expect(conRuta).toEqual([
      "src/app/apoyar/page.tsx",
      "src/components/layout/SiteFooter.tsx",
      "src/components/layout/SiteHeader.tsx",
      "src/lib/site.ts",
    ]);
    expect(leer(path.join(SRC, "components/layout/SiteFooter.tsx"))).toMatch(/donacionesActivas\(\) \? \(\n\s*<li>\n\s*<Link href="\/apoyar"/);
    expect(leer(path.join(SRC, "components/layout/SiteHeader.tsx"))).toMatch(/donacionesActivas\(\) \? \(\n\s*<Link href="\/apoyar"/);
    expect(leer(path.join(SRC, "lib/site.ts"))).toMatch(/donacionesActivas\(\) \? \[\.\.\.RUTAS_PUBLICAS, "\/apoyar"\] : \[\.\.\.RUTAS_PUBLICAS\]/);
    expect(leer(path.join(SRC, "app/sitemap.ts"))).toMatch(/rutasPublicas\(\)\.map/);
  });
});

describe("cuentas de personas usuarias", () => {
  const delaCuenta = fuentes.filter((r) => /^src\/lib\/(cuentas|correo)\//.test(relativa(r)));
  const paginasCuenta = fuentes.filter((r) => relativa(r).startsWith("src/app/cuenta/") && /\/(page|route)\.tsx?$/.test(r));
  const acciones = leer(path.join(SRC, "app/acciones/cuenta.ts"));

  /** Las únicas acciones que, por definición, se ejecutan sin una sesión completa: la crean, la piden o la recuperan. */
  const SIN_SESION = [
    "activarCuentaAccion",
    "crearCuentaAccion",
    "entrarAccion",
    "olvideAccion",
    "restablecerAccion",
    "verificarSegundoPasoAccion",
  ];
  /** Páginas que se ven sin sesión (formularios de entrada, enlaces de correo y la despedida). */
  const PAGINAS_SIN_SESION = [
    "src/app/cuenta/activar/page.tsx",
    "src/app/cuenta/crear/page.tsx",
    "src/app/cuenta/eliminada/page.tsx",
    "src/app/cuenta/entrar/page.tsx",
    "src/app/cuenta/olvide/page.tsx",
    "src/app/cuenta/restablecer/page.tsx",
    "src/app/cuenta/verificar/page.tsx",
  ];

  it("hay código de cuentas y páginas de cuenta (la prueba vigila algo)", () => {
    expect(delaCuenta.length).toBeGreaterThan(15);
    expect(paginasCuenta.length).toBeGreaterThanOrEqual(10);
  });

  it("toda Server Action de la cuenta exige sesión y token CSRF, salvo las que la crean o la piden (lista cerrada)", () => {
    const sinExigir = funcionesExportadas(acciones)
      .filter(({ cuerpo }) => !/\b(conSesion|exigirAccionCuenta)\(/.test(cuerpo))
      .map(({ nombre }) => nombre)
      .sort();
    expect(sinExigir).toEqual(SIN_SESION);
    // `conSesion` es el que exige: sesión vigente y token anti-CSRF del formulario.
    expect(/async function conSesion\([\s\S]*?\n}\n/.exec(acciones)?.[0] ?? "").toMatch(/exigirAccionCuenta\(/);
  });

  it("toda página y ruta privada de la cuenta exige la sesión en el servidor; las públicas son una lista cerrada", () => {
    const sinSesion = paginasCuenta.filter((r) => !/\bexigirSesionCuenta\(/.test(leer(r))).map(relativa);
    expect(sinSesion).toEqual(PAGINAS_SIN_SESION);
    expect(relativa(paginasCuenta.find((r) => r.endsWith("exportar/route.ts"))!)).toBe("src/app/cuenta/exportar/route.ts");
  });

  it("ninguna página de la cuenta se indexa", () => {
    const infractores = paginasCuenta
      .filter((r) => r.endsWith("page.tsx") && !/robots:\s*\{\s*index:\s*false/.test(leer(r)))
      .map(relativa);
    expect(infractores).toEqual([]);
  });

  it("la descarga de datos solo responde a GET, rechaza lo iniciado desde otro sitio y nunca se guarda en cachés", () => {
    const ruta = leer(path.join(SRC, "app/cuenta/exportar/route.ts"));
    expect([...ruta.matchAll(/export (?:async )?function ([A-Z]+)/g)].map((m) => m[1])).toEqual(["GET"]);
    expect(ruta).toMatch(/sec-fetch-site/);
    expect(ruta).toMatch(/"Cache-Control": "no-store"/);
    expect(ruta).toMatch(/attachment/);
  });

  it("ningún valor secreto vuelve al navegador: las acciones solo devuelven lo que no es secreto", () => {
    const infractores = [...acciones.matchAll(/\bvalores\s*=\s*\{([^}]*)\}/g)]
      .filter((m) => /\b(clave|actual|nueva|repetir|codigo|token|invitacion)\b/.test(m[1]))
      .map((m) => m[0]);
    expect(infractores).toEqual([]);
  });

  it("nada de cuentas hace peticiones por su cuenta, lee el entorno o escribe en la consola, salvo lo previsto", () => {
    const infractores: string[] = [];
    for (const ruta of delaCuenta) {
      const texto = leer(ruta);
      const rel = relativa(ruta);
      // El único lugar que sale a internet: el envío de correo a Resend (y la lista de espera lo reutiliza).
      if (/\bfetch\b/.test(texto) && rel !== "src/lib/correo/resend.ts") infractores.push(`${rel}: peticiones`);
      if (/XMLHttpRequest|\bWebSocket\b|node:(http|https|net|child_process)/.test(texto)) infractores.push(`${rel}: red`);
      if (/process\.env/.test(texto)) infractores.push(`${rel}: process.env`);
      // En modo de prueba (sin correo real) el enlace queda en el registro del servidor: una sola línea, en `instancia.ts`.
      const consolas = (texto.match(/\bconsole\./g) ?? []).length;
      if (consolas > (rel === "src/lib/cuentas/instancia.ts" ? 1 : 0)) infractores.push(`${rel}: console`);
    }
    expect(infractores).toEqual([]);
  });

  it("el navegador no guarda nada de la sesión: sin localStorage, sessionStorage ni document.cookie en las cuentas", () => {
    const infractores = fuentes
      .filter((r) => /^src\/(components\/cuenta|lib\/cuentas|app\/cuenta)\//.test(relativa(r)))
      .filter((r) => /localStorage|sessionStorage|document\.cookie|indexedDB/.test(leer(r)))
      .map(relativa);
    expect(infractores).toEqual([]);
  });

  it("los módulos que leen cookies y cabeceras o arman el servicio con la base dicen `server-only`", () => {
    for (const modulo of ["lib/cuentas/acceso.ts", "lib/cuentas/instancia.ts"]) {
      expect(leer(path.join(SRC, modulo)), modulo).toMatch(/^import "server-only";/m);
    }
  });

  it("la cookie de sesión es `__Host-`, HttpOnly, Secure y SameSite, y se fija solo desde `acceso.ts`", () => {
    const usuarios = fuentes.filter((r) => /COOKIE_SESION_CUENTA/.test(leer(r)) && !r.endsWith("constantes.ts")).map(relativa);
    expect(usuarios).toEqual(["src/lib/cuentas/acceso.ts"]);
    const acceso = leer(path.join(SRC, "lib/cuentas/acceso.ts"));
    expect(acceso.match(/\.set\(/g)).toHaveLength(2); // fijar y borrar, nada más
    expect(acceso).toMatch(/\.\.\.OPCIONES_COOKIE_CUENTA/);
  });

  it("los temas que admite la base (migración 0006) son los del sitio", () => {
    const sql = leer(path.join(RAIZ, "db/migraciones/0006_cuentas.sql"));
    const enBase = /temas <@ array\[([^\]]*)\]/.exec(sql)?.[1].match(/'([a-z_]+)'/g)?.map((t) => t.replaceAll("'", "")) ?? [];
    expect(enBase.sort()).toEqual([...TEMAS].sort());
  });
});

describe("inventario de la superficie expuesta", () => {
  it("las Server Actions son estas (una nueva exige revisar su autenticación y su validación)", () => {
    const conAcciones = fuentes.filter((r) => /^\s*["']use server["'];?/.test(leer(r))).map(relativa);
    expect(conAcciones).toEqual([
      "src/app/acciones/cuenta.ts",
      "src/app/acciones/lista-de-espera.ts",
      "src/app/admin/acciones.ts",
      "src/app/admin/alertas/acciones.ts",
      "src/app/admin/eventos/acciones.ts",
      "src/app/admin/invitaciones/acciones.ts",
    ]);
  });

  it("los endpoints HTTP son estos (uno nuevo exige límites de tamaño y volumen, y revisar qué devuelve)", () => {
    const rutas = archivos(path.join(SRC, "app"), (r) => /\/route\.ts$/.test(r)).map(relativa);
    expect(rutas).toEqual([
      "src/app/.well-known/security.txt/route.ts",
      "src/app/api/asistente/route.ts",
      "src/app/api/csp-report/route.ts",
      "src/app/api/resumen/baja/route.ts",
      "src/app/api/salud/route.ts",
      "src/app/api/tareas/ingesta/route.ts",
      "src/app/api/tareas/resumen/route.ts",
      "src/app/cuenta/exportar/route.ts",
    ]);
  });
});

describe("resumen diario por correo y temas seguidos (docs/alertas-reales.md §7 y §8.4)", () => {
  const delResumen = fuentes.filter((r) => /^src\/lib\/resumen\//.test(relativa(r)));
  const ruta = leer(path.join(SRC, "app/api/tareas/resumen/route.ts"));
  const rutaBaja = leer(path.join(SRC, "app/api/resumen/baja/route.ts"));
  const manejadorBaja = leer(path.join(SRC, "lib/resumen/manejador-baja.ts"));
  const almacen = leer(path.join(SRC, "lib/resumen/almacen-postgres.ts"));
  const configuracion = leer(path.join(SRC, "lib/env.ts"));

  it("hay código del resumen (la prueba vigila algo)", () => {
    expect(delResumen.length).toBeGreaterThanOrEqual(7);
  });

  it("nace apagado y solo en el servicio de tareas: la ruta pasa primero por exigirTarea y resumenActivo, con 404 a todo lo demás", () => {
    expect(configuracion).toMatch(/RESUMEN_MODO: z\.enum\(\["apagado", "activo"\]\)\.default\("apagado"\)/);
    expect(configuracion).toMatch(/RESUMEN_MODO=activo solo en el servicio de tareas/);
    const metodos = [...ruta.matchAll(/^export const ([A-Z]+) = manejar;$/gm)].map((m) => m[1]);
    expect(metodos).toEqual(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    const manejar = /async function manejar\(request: Request\): Promise<Response> \{\n([\s\S]*?)\n\}/.exec(ruta)?.[1] ?? "";
    expect(manejar.trim().split("\n")[0]).toBe('if (!exigirTarea(request, env, logSecurityEvent, "resumen") || !resumenActivo()) notFound();');
    expect(ruta).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob|body)\b|cookies\(|headers\(\)/);
    expect(ruta).toMatch(/"Cache-Control": "no-store"/);
  });

  it("nada del resumen sale a internet por su cuenta, lee el entorno o escribe en la consola: el correo va por Resend", () => {
    const infractores: string[] = [];
    for (const archivo of delResumen) {
      const texto = leer(archivo);
      const rel = relativa(archivo);
      if (/\bfetch\(|XMLHttpRequest|\bWebSocket\b|node:(http|https|net|tls|dgram|child_process)/.test(texto)) infractores.push(`${rel}: red`);
      if (/process\.env/.test(texto)) infractores.push(`${rel}: process.env`);
      if (/\bconsole\./.test(texto)) infractores.push(`${rel}: console`);
    }
    expect(infractores).toEqual([]);
    expect(delResumen.filter((r) => /crearEnviadorResend\(/.test(leer(r))).map(relativa)).toEqual(["src/lib/resumen/instancia.ts"]);
  });

  it("de lo publicado lee solo lo real, publicado o corregido, y nunca el texto de la alerta ni sus fuentes", () => {
    const sql = /const SQL_PUBLICADAS = `([\s\S]*?)`;/.exec(almacen)?.[1] ?? "";
    expect(sql).toMatch(/a\.es_ejemplo = false and a\.estado in \('publicada', 'corregida'\)/);
    expect(sql).not.toMatch(/\b(resumen|filas|url|titulo_documento|nombre_fuente|identificador)\b/);
    expect(delResumen.filter((r) => /\.publicas\(/.test(leer(r)))).toEqual([]);
    const correo = leer(path.join(SRC, "lib/resumen/correo.ts"));
    expect(correo).toMatch(/AVISO_NO_ASESORIA = "Información y análisis; no es asesoría\."/);
    expect(correo).toMatch(/"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  });

  it("la baja es un POST con un token del que solo se busca su hash; un GET solo lleva a la página que pide confirmar", () => {
    expect([...rutaBaja.matchAll(/^export const ([A-Z]+) = manejar;$/gm)].map((m) => m[1])).toEqual(["GET", "HEAD", "POST"]);
    const cuerpo = /return async function manejar[\s\S]*$/.exec(manejadorBaja)?.[0] ?? "";
    // El GET responde antes de que aparezca la llamada a la base, y el POST no lee el cuerpo.
    expect(cuerpo.indexOf('request.method === "GET"')).toBeGreaterThan(-1);
    expect(cuerpo.indexOf('request.method === "GET"')).toBeLessThan(cuerpo.indexOf("deps.darDeBaja(token)"));
    expect(manejadorBaja).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob|body)\b|cookies\(/);
    expect(manejadorBaja).toMatch(/MAX_CUERPO_BYTES = 1024/);
    expect(manejadorBaja).toMatch(/porIp\.tryConsume\(huella\)/);
    expect(leer(path.join(SRC, "lib/resumen/baja.ts"))).toMatch(/almacen\.darDeBaja\(hashToken\(token\), ahora\)/);
    // La página no cambia nada al abrirse: no llama a la baja ni tiene Server Actions; su formulario hace el POST.
    const pagina = leer(path.join(SRC, "app/resumen/baja/page.tsx"));
    expect(pagina).not.toMatch(/darDeBaja|bajaResumen\(|use server/);
    expect(pagina).toMatch(/<form method="post" action=\{`\$\{RUTA_BAJA\}\?t=\$\{token\}`\}/);
    expect(pagina).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(leer(path.join(RAIZ, "next.config.ts"))).toMatch(/source: "\/resumen\/:path\*"[^\n]*strict-origin/);
  });

  it("los temas se guardan con una acción de la cuenta (sesión y CSRF) y la portada la entrega al selector como propiedad", () => {
    const acciones = leer(path.join(SRC, "app/acciones/cuenta.ts"));
    const seguir = funcionesExportadas(acciones).find((f) => f.nombre === "seguirTemasAccion")?.cuerpo ?? "";
    expect(seguir.replace(/^\{/, "").trim().split("\n")[0]).toBe("const s = await conSesion(f);");
    expect(leer(path.join(SRC, "lib/cuentas/servicio.ts"))).toMatch(/TemasSchema\.safeParse\(/);
    const selector = leer(path.join(SRC, "components/home/TopicPicker.tsx"));
    expect(selector).toMatch(/^import type \{ EstadoFormulario \} from "@\/app\/acciones\/cuenta";$/m);
    expect(selector).not.toMatch(/^import \{[^}]*\} from "@\/app\/acciones/m);
  });
});

describe("ingesta y tareas programadas (salidas a internet, docs/alertas-reales.md §2 y §8.4)", () => {
  const deLaIngesta = fuentes.filter((r) => /^src\/lib\/(ingesta|borradores|tareas)\//.test(relativa(r)));
  const descarga = leer(path.join(SRC, "lib/ingesta/descarga.ts"));
  const ruta = leer(path.join(SRC, "app/api/tareas/ingesta/route.ts"));
  const exigir = leer(path.join(SRC, "lib/tareas/exigir.ts"));

  it("hay código de la ingesta (la prueba vigila algo)", () => {
    expect(deLaIngesta.map(relativa)).toEqual(expect.arrayContaining(["src/lib/ingesta/descarga.ts", "src/lib/tareas/exigir.ts"]));
    expect(deLaIngesta.length).toBeGreaterThanOrEqual(8);
  });

  it("solo descarga.ts sale a internet; nada de la ingesta lee el entorno (salvo la instancia, vía env.ts) ni usa la consola", () => {
    const infractores: string[] = [];
    for (const archivo of deLaIngesta) {
      const texto = leer(archivo);
      const rel = relativa(archivo);
      if (/\bfetch\(/.test(texto) && rel !== "src/lib/ingesta/descarga.ts") infractores.push(`${rel}: fetch`);
      if (/XMLHttpRequest|\bWebSocket\b|node:(http|https|net|tls|dgram|child_process)|from ["'](undici|axios|got)/.test(texto)) {
        infractores.push(`${rel}: red`);
      }
      if (/process\.env/.test(texto)) infractores.push(`${rel}: process.env`);
      if (/\bconsole\./.test(texto)) infractores.push(`${rel}: console`);
    }
    expect(infractores).toEqual([]);
    expect([...descarga.matchAll(/\bfetch\(/g)]).toHaveLength(1);
  });

  it("descarga.ts valida antes de conectar, sigue las redirecciones a mano y corta por tiempo y por tamaño", () => {
    const cuerpo = /return async function descargar[\s\S]*$/.exec(descarga)?.[0] ?? "";
    // La validación contra el registro va antes de la única llamada a `fetch`.
    expect(cuerpo.indexOf("destinoPermitido(")).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("destinoPermitido(")).toBeLessThan(cuerpo.indexOf("fetch("));
    expect(cuerpo).toMatch(/redirect: "manual"/);
    expect(cuerpo).toMatch(/destinoSeguro\(siguiente\.href, solicitud\.fuente\.url_base\)/);
    expect(cuerpo).toMatch(/AbortSignal\.timeout\(tiempoMs\)/);
    expect(cuerpo).toMatch(/leerLimitado\(respuesta, MAX_BYTES\[clase\]\)/);
    expect(descarga).not.toMatch(/\.(text|json|blob|formData)\(\)/);
    expect(descarga).toMatch(/"User-Agent": config\.agente/);
  });

  it("el lector de feeds rechaza DTD y entidades antes de analizar, y no usa analizadores con expansión de entidades", () => {
    const feeds = leer(path.join(SRC, "lib/ingesta/feeds.ts"));
    expect(feeds).toMatch(/<!\\s\*\(DOCTYPE\|ENTITY/);
    expect(feeds).not.toMatch(/DOMParser|xml2js|fast-xml-parser|libxml|sax/i);
  });

  it("la ruta de la ingesta: todos los métodos pasan primero por exigirTarea y no lee cuerpo, cookies ni cabeceras", () => {
    const metodos = [...ruta.matchAll(/^export const ([A-Z]+) = manejar;$/gm)].map((m) => m[1]);
    expect(metodos).toEqual(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    expect(ruta).not.toMatch(/export (async )?function [A-Z]+/);
    const manejar = /async function manejar\(request: Request\): Promise<Response> \{\n([\s\S]*?)\n\}/.exec(ruta)?.[1] ?? "";
    expect(manejar.trim().split("\n")[0]).toBe("if (!exigirTarea(request)) notFound();");
    expect(ruta).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob|body)\b|cookies\(|headers\(\)/);
    expect(ruta).toMatch(/"Cache-Control": "no-store"/);
  });

  it("exigirTarea: modo activo, POST, sin cuerpo y secreto comparado en tiempo constante", () => {
    expect(exigir).toMatch(/tareasActivas\(configuracion\)/);
    expect(exigir).toMatch(/request\.method !== "POST"/);
    expect(exigir).toMatch(/content-length/);
    expect(exigir).toMatch(/transfer-encoding/);
    expect(exigir).toMatch(/timingSafeEqual\(resumen\(enviado\), resumen\(configuracion\.TAREAS_SECRETO\)\)/);
  });

  it("las tareas nacen apagadas: TAREAS_MODO es inactivo por omisión y la dirección de pruebas exige OTEA_E2E=1", () => {
    const configuracion = leer(path.join(SRC, "lib/env.ts"));
    expect(configuracion).toMatch(/TAREAS_MODO: z\.enum\(\["inactivo", "activo"\]\)\.default\("inactivo"\)/);
    expect(configuracion).toMatch(/e\.INGESTA_URL_PRUEBA && e\.OTEA_E2E !== "1"/);
    expect(leer(path.join(SRC, "lib/ingesta/instancia.ts"))).toMatch(/env\.OTEA_E2E === "1" \? env\.INGESTA_URL_PRUEBA : undefined/);
  });
});

describe("tamaño de lo que recibe el servidor (control 14)", () => {
  it("los cuerpos de las Server Actions están limitados a 100 KB como máximo (el tope de Next.js es 1 MB)", () => {
    const limite = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limite, "falta experimental.serverActions.bodySizeLimit en next.config.ts").toBeDefined();
    const kb = typeof limite === "number" ? limite / 1024 : Number(/^(\d+)\s*kb$/i.exec(String(limite))?.[1]);
    expect(kb).toBeGreaterThan(0);
    expect(kb).toBeLessThanOrEqual(100);
  });

  it("los endpoints HTTP que reciben un cuerpo (reportes de la CSP y preguntas al asistente) limitan su tamaño", () => {
    expect(leer(path.join(SRC, "lib/security/csp-report.ts"))).toMatch(/16 \* 1024|16_384|MAX_BYTES/);
    const asistente = leer(path.join(SRC, "lib/asistente/manejador.ts"));
    expect(asistente).toMatch(/leerCuerpoLimitado\(request, MAX_CUERPO_BYTES\)/);
    expect(leer(path.join(SRC, "lib/asistente/limites.ts"))).toMatch(/MAX_CUERPO_BYTES = 8 \* 1024/);
  });
});

describe("contenido y archivos (controles 15 y 16)", () => {
  it("`dangerouslySetInnerHTML` aparece solo dos veces: el JSON-LD fijo de la portada y el script de movimiento", () => {
    const usos = fuentes.flatMap((r) => (leer(r).match(/dangerouslySetInnerHTML/g) ?? []).map(() => relativa(r)));
    expect([...usos].sort()).toEqual(["src/app/page.tsx", "src/components/motion/ScriptMovimiento.tsx"]);
    // JSON-LD: contenido fijo, con `<` escapado para que no pueda cerrar la etiqueta.
    expect(leer(path.join(SRC, "app/page.tsx"))).toContain('.replace(/</g, "\\\\u003c")');
  });

  it("el script de movimiento es una constante de la compilación: sin datos de la solicitud y con el nonce de la CSP", () => {
    const script = leer(path.join(SRC, "components/motion/ScriptMovimiento.tsx"));
    // Todo el código sale de `codigoMotor(OPCIONES_SITIO)`; de la solicitud solo llega el nonce, como atributo.
    expect(script).toContain("__html: codigoMotor(OPCIONES_SITIO)");
    expect(script).toContain("nonce={nonce}");
    expect(script).not.toMatch(/headers\(|cookies\(|searchParams|params|request|process\.env/);
    // Y la CSP sigue sin admitir scripts en línea sin nonce.
    expect(buildCsp("n", { dev: false })).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("el sitio no recibe archivos: sin campos de archivo ni manejo de subidas", () => {
    const infractores: string[] = [];
    for (const ruta of fuentes) {
      const texto = leer(ruta);
      if (/type=["']file["']|instanceof\s+File\b|\bnew\s+File\(|formidable|multer|busboy|\.arrayBuffer\(\)/.test(texto)) {
        infractores.push(relativa(ruta));
      }
    }
    // Si algún día se suben archivos: lista cerrada de tipos (por contenido, no por extensión), tamaño
    // máximo, nombres aleatorios, almacenamiento fuera de `public/` y sin ejecución, y revisión antes.
    expect(infractores).toEqual([]);
  });

  it("`public/` solo tiene logos e íconos: lista cerrada de carpetas, tipos y tamaño", () => {
    const publico = path.join(RAIZ, "public");
    const todos = archivos(publico, () => true).map((r) => path.relative(publico, r).split(path.sep).join("/"));
    expect(todos.length).toBeGreaterThan(0);
    for (const ruta of todos) {
      expect(ruta, ruta).toMatch(/^(brand|icons)\/[a-z0-9-]+\.(svg|png)$/);
      expect(statSync(path.join(publico, ruta)).size, ruta).toBeLessThan(200_000);
    }
  });

  it("las tipografías van en el repositorio: nada descarga fuentes al construir y cada archivo tiene su aviso OFL", () => {
    // `next/font/google` baja los archivos de Google al compilar: la CI falló dos veces sin red hacia fonts.gstatic.com.
    const conGoogle = fuentes.filter((r) => /from ["']next\/font\/google["']|fonts\.(googleapis|gstatic)\.com/.test(leer(r))).map(relativa);
    expect(conGoogle).toEqual([]);
    expect(fuentes.filter((r) => /["']next\/font\/local["']/.test(leer(r))).map(relativa)).toEqual(["src/app/_tipografias/index.ts"]);
    const carpeta = path.join(SRC, "app/_tipografias");
    const woff2 = archivos(carpeta, (r) => r.endsWith(".woff2"));
    expect(woff2.length).toBe(6);
    const avisos = leer(path.join(RAIZ, "AVISOS-DE-TERCEROS.md"));
    expect(avisos).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    for (const ruta of woff2) {
      const hash = createHash("sha256").update(readFileSync(ruta)).digest("hex");
      expect(avisos, path.basename(ruta)).toContain(`| \`${path.basename(ruta)}\` |`);
      expect(avisos, path.basename(ruta)).toContain(hash);
    }
  });

  it("los SVG no llevan scripts, manejadores de eventos ni referencias externas", () => {
    const svgs = [
      ...archivos(path.join(RAIZ, "public"), (r) => r.endsWith(".svg")),
      path.join(SRC, "app/icon.svg"),
    ];
    expect(svgs.length).toBeGreaterThan(0);
    for (const ruta of svgs) {
      const svg = leer(ruta);
      expect(svg, relativa(ruta)).not.toMatch(/<script|\son\w+\s*=|javascript:|<foreignObject|(xlink:)?href\s*=\s*["']https?:/i);
    }
  });
});
