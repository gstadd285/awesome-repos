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
    /^(pg|server-only|node:.+|@\/lib\/env|@\/lib\/db(\/.*)?|@\/lib\/admin\/(acceso|almacen|sesion|clave|totp)|@\/lib\/alertas\/(repositorio|instancia|formulario)|@\/lib\/waitlist\/(instance|store|store-postgres|service|correo))$/;

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

describe("autenticación del panel (control 6)", () => {
  const acciones = fuentes.filter((r) => relativa(r).startsWith("src/app/admin/") && r.endsWith("acciones.ts"));
  const paginas = fuentes.filter((r) => relativa(r).startsWith("src/app/admin/") && /\/(page|layout)\.tsx$/.test(r));
  /** El inicio de sesión es la única acción que, por definición, se ejecuta sin sesión. */
  const SIN_SESION = new Set(["iniciarSesion"]);

  /** Cuerpo de cada función exportada, hasta la llave que la cierra. */
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

describe("inventario de la superficie expuesta", () => {
  it("las Server Actions son estas (una nueva exige revisar su autenticación y su validación)", () => {
    const conAcciones = fuentes.filter((r) => /^\s*["']use server["'];?/.test(leer(r))).map(relativa);
    expect(conAcciones).toEqual([
      "src/app/acciones/lista-de-espera.ts",
      "src/app/admin/acciones.ts",
      "src/app/admin/alertas/acciones.ts",
    ]);
  });

  it("los endpoints HTTP son estos (uno nuevo exige límites de tamaño y volumen, y revisar qué devuelve)", () => {
    const rutas = archivos(path.join(SRC, "app"), (r) => /\/route\.ts$/.test(r)).map(relativa);
    expect(rutas).toEqual([
      "src/app/.well-known/security.txt/route.ts",
      "src/app/api/csp-report/route.ts",
      "src/app/api/salud/route.ts",
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

  it("el único endpoint HTTP que recibe un cuerpo (reportes de la CSP) limita su tamaño", () => {
    expect(leer(path.join(SRC, "lib/security/csp-report.ts"))).toMatch(/16 \* 1024|16_384|MAX_BYTES/);
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
