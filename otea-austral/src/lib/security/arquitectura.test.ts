/**
 * Guardas de arquitectura: leen el código fuente y fallan si alguien rompe, sin querer, una regla de
 * seguridad del proyecto. No sustituyen a una revisión: convierten reglas escritas en CLAUDE.md en
 * comprobaciones automáticas (plan de los 20 controles, `docs/seguridad/plan-20-controles.md`).
 *
 * Cuando una de estas pruebas falla porque agregaste algo a propósito (una ruta, una acción, un archivo
 * en `public/`), no la silencies: revisa la superficie nueva, documéntala y actualiza el inventario.
 */
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
    /^(pg|server-only|node:.+|@\/lib\/env|@\/lib\/db(\/.*)?|@\/lib\/admin\/(acceso|almacen|sesion|clave|totp)|@\/lib\/alertas\/(repositorio|instancia|formulario)|@\/lib\/waitlist\/(instance|store|store-postgres|service|correo)|@\/lib\/asistente\/(?!limites$|cliente$).+|@\/lib\/cuentas\/(?!formato-secreto$).+|@\/lib\/correo\/.+)$/;

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
    for (const modulo of ["lib/env.ts", "lib/db/cliente.ts", "lib/db/instancia.ts", "lib/admin/acceso.ts"]) {
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

  it("solo el proveedor de Anthropic importa el SDK: un único lugar llama al servicio de pago", () => {
    const usuarios = fuentes.filter((r) => /["']@anthropic-ai\/sdk/.test(leer(r))).map(relativa);
    expect(usuarios).toEqual(["src/lib/asistente/proveedor-anthropic.ts"]);
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
    const privadas = paginas.filter((r) => relativa(r).startsWith("src/app/admin/alertas/") && r.endsWith("page.tsx"));
    expect(privadas.length).toBeGreaterThanOrEqual(3);
    for (const ruta of privadas) expect(leer(ruta), relativa(ruta)).toMatch(/\bexigirSesion\(/);
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
      .filter((m) => /\b(clave|actual|nueva|repetir|codigo|token)\b/.test(m[1]))
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
    ]);
  });

  it("los endpoints HTTP son estos (uno nuevo exige límites de tamaño y volumen, y revisar qué devuelve)", () => {
    const rutas = archivos(path.join(SRC, "app"), (r) => /\/route\.ts$/.test(r)).map(relativa);
    expect(rutas).toEqual([
      "src/app/.well-known/security.txt/route.ts",
      "src/app/api/asistente/route.ts",
      "src/app/api/csp-report/route.ts",
      "src/app/api/salud/route.ts",
      "src/app/cuenta/exportar/route.ts",
    ]);
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
