import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  entropia,
  escanearArbol,
  escanearHistorial,
  escanearLinea,
  escanearTexto,
  esMarcador,
  raizDelRepositorio,
  redactar,
} from "../../../scripts/lib/escaner-secretos.mjs";

// Los valores falsos se arman por partes para que este archivo no contenga, literalmente, nada que
// el propio escáner (que revisa también las pruebas) tome por una clave.
const AWS = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
const GITHUB = "gh" + "p_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const GOOGLE = "AI" + "za" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
const RESEND = "re" + "_" + "AbCd1234" + "_" + "EfGh5678IjKl9012MnOp3456";
const LLAVE = "-----BEGIN " + "PRIVATE KEY-----";
const URL_REAL = "post" + "gresql://otea_web:" + "Zq8xK2mVn5Lp" + "@ep-real-pooler.neon.tech/neondb";

const nombres = (linea: string, ruta = "src/x.ts") => escanearLinea(linea, ruta).map((h) => h.regla);

describe("reglas de proveedor", () => {
  it.each([
    ["llave privada", LLAVE, "llave-privada"],
    ["clave de AWS", `aws_id = "${AWS}"`, "aws"],
    ["token de GitHub", `token ${GITHUB}`, "github"],
    ["clave de Google", `key: '${GOOGLE}'`, "google"],
    ["clave de Resend", `RESEND_API_KEY=${RESEND}`, "resend"],
    ["URL de base con clave", `DATABASE_URL=${URL_REAL}`, "url-con-clave"],
  ])("detecta %s", (_nombre, linea, regla) => {
    expect(nombres(linea)).toContain(regla);
  });

  it("también las aplica en pruebas y e2e (sin perdón por ser una prueba)", () => {
    expect(nombres(`x = "${AWS}"`, "src/lib/x.test.ts")).toContain("aws");
    expect(nombres(`x = "${GITHUB}"`, "e2e/ayudas.ts")).toContain("github");
  });
});

describe("falsos positivos conocidos", () => {
  it.each([
    "# DATABASE_URL=postgresql://otea_web:CLAVE@localhost:5432/otea",
    "export DATABASE_URL_ADMIN='postgresql://DUEÑO:CLAVE@HOST/otea?sslmode=verify-full'",
    "PRUEBAS_DATABASE_URL: postgres://postgres:postgres-ci@localhost:5432/postgres",
    "DATABASE_URL: postgres://otea_web:ci-otea-web-solo-pruebas@localhost:5432/postgres",
    'const DB = "postgresql://otea_web:clave@ep-ejemplo-pooler.neon.tech/neondb"',
    "# RESEND_API_KEY=re_...",
    'apiKey: "re_prueba_123456"',
    "const claveFija = process.env.CLAVE_ROL_APP;",
    "# ADMIN_SESION_SECRETO=...",
    "CLAVE_ROL_APP: ci-otea-web-solo-pruebas",
    "--set-secrets=ADMIN_SESION_SECRETO=admin-sesion-secreto:latest",
    "ADMIN_TOTP_SECRETO: z.string().regex(/^[A-Z2-7]{32}$/, 'Secreto TOTP inválido')",
    "const CLAVE_VALIDA = /^[A-Za-z0-9_-]{16,128}$/;",
  ])("no marca: %s", (linea) => {
    expect(nombres(linea)).toEqual([]);
  });

  it("respeta la marca de ignorar con su motivo", () => {
    expect(nombres(`x = "${AWS}" # escaner:ignorar ejemplo de la documentación de AWS`)).toEqual([]);
  });
});

describe("asignación sospechosa", () => {
  const secreto = "Xk9Qm2Zr7Lp4Tn8Vb3Hs6Jd1Wc5Yg0Fa2Ue4Ro";

  it("marca una variable de secreto con un valor aleatorio", () => {
    expect(nombres(`ADMIN_SESION_SECRETO=${secreto}`)).toEqual(["asignacion-sospechosa"]);
    expect(nombres(`  apiKey: "${secreto}",`)).toEqual(["asignacion-sospechosa"]);
    expect(nombres(`WAITLIST_CLAVE_CIFRADO = ${secreto}`)).toEqual(["asignacion-sospechosa"]);
  });

  it("en pruebas solo valen las reglas de proveedor (los valores falsos son su oficio)", () => {
    expect(nombres(`const SECRETO = "${secreto}";`, "src/lib/admin/admin.test.ts")).toEqual([]);
  });

  it("no marca valores de poca entropía ni marcadores", () => {
    expect(nombres("API_KEY=aaaaaaaaaaaaaaaaaaaaaaaa1")).toEqual([]);
    expect(nombres("PASSWORD=CAMBIAR_ESTA_CLAVE_ANTES_DE_USAR_123")).toEqual([]);
    expect(nombres("TOKEN=tu-clave-aqui-123456789012345")).toEqual([]);
  });
});

describe("hash del panel", () => {
  const sal = "A".repeat(22);
  const hash = "B".repeat(43);

  it("marca un hash con la forma real fuera de las pruebas", () => {
    expect(nombres(`ADMIN_CLAVE_HASH=pbkdf2-sha256$600000$${sal}$${hash}`)).toContain("hash-del-panel");
  });

  it("no marca los marcadores de la documentación", () => {
    expect(nombres("# ADMIN_CLAVE_HASH=pbkdf2-sha256$600000$...$...")).toEqual([]);
  });
});

describe("utilidades", () => {
  it("entropía: constante cero, aleatoria alta", () => {
    expect(entropia("")).toBe(0);
    expect(entropia("aaaaaaaa")).toBe(0);
    expect(entropia("Xk9Qm2Zr7Lp4Tn8Vb3Hs6Jd1Wc5Yg0Fa2Ue4Ro")).toBeGreaterThan(4.5);
  });

  it("esMarcador reconoce los ejemplos", () => {
    for (const v of ["CLAVE", "<clave>", "${CLAVE}", "$CLAVE", "xxxx", "...", "ejemplo-123", "changeme"]) {
      expect(esMarcador(v), v).toBe(true);
    }
    expect(esMarcador("Zq8xK2mVn5Lp")).toBe(false);
  });

  it("nunca devuelve el valor completo", () => {
    const [h] = escanearLinea(`x = "${AWS}"`, "src/x.ts");
    expect(h.vista).toBe(redactar(AWS));
    expect(h.vista).not.toContain(AWS);
    // Solo el comienzo (4 caracteres) y el largo.
    expect(h.vista).not.toContain(AWS.slice(0, 5));
    expect(h.vista).toBe(`${AWS.slice(0, 4)}… (${AWS.length} caracteres)`);
  });

  it("escanearTexto da el número de línea", () => {
    const hallazgos = escanearTexto(`uno\ndos\nx = "${AWS}"\ncuatro`, "a.ts");
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({ regla: "aws", ruta: "a.ts", linea: 3 });
  });
});

describe("repositorio de git", () => {
  let raiz = "";
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=prueba@example.org", "-c", "user.name=Prueba", "-c", "commit.gpgsign=false", ...args], {
      cwd: raiz,
      stdio: "pipe",
    })
      .toString()
      .trim();

  beforeAll(() => {
    raiz = mkdtempSync(path.join(tmpdir(), "escaner-"));
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(raiz, ".gitignore"), ".env\n");
    writeFileSync(path.join(raiz, "limpio.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "inicio");
    // Un secreto que se sube y se borra en el commit siguiente: sigue en el historial.
    mkdirSync(path.join(raiz, "src"));
    writeFileSync(path.join(raiz, "src", "config.ts"), `export const a = 1;\nexport const id = "${AWS}";\n`);
    git("add", ".");
    git("commit", "-q", "-m", "subida por error");
    writeFileSync(path.join(raiz, "src", "config.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "se borra");
    // Otra rama con otro secreto.
    git("checkout", "-q", "-b", "lateral");
    writeFileSync(path.join(raiz, "lateral.txt"), `token ${GITHUB}\n`);
    git("add", ".");
    git("commit", "-q", "-m", "rama lateral");
    git("checkout", "-q", "main");
  });

  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  it("el árbol de trabajo está limpio aunque el historial no", async () => {
    expect(await escanearArbol(raiz)).toEqual([]);
  });

  it("el historial muestra el secreto borrado, con commit, archivo y línea, y también el de otra rama", async () => {
    const hallazgos = await escanearHistorial(raiz);
    const aws = hallazgos.find((h: { regla: string }) => h.regla === "aws");
    expect(aws).toMatchObject({ ruta: "src/config.ts", linea: 2 });
    expect(aws?.commit).toMatch(/^[0-9a-f]{7}$/);
    expect(hallazgos.some((h: { regla: string; ruta: string }) => h.regla === "github" && h.ruta === "lateral.txt")).toBe(true);
    for (const h of hallazgos) expect(JSON.stringify(h)).not.toContain(AWS);
  });

  it("un archivo nuevo sin versionar también se revisa, pero uno ignorado (.env) no", async () => {
    writeFileSync(path.join(raiz, "nuevo.ts"), `const x = "${GOOGLE}";\n`);
    writeFileSync(path.join(raiz, ".env"), `CLAVE=${AWS}\n`);
    const rutas = (await escanearArbol(raiz)).map((h: { ruta: string }) => h.ruta);
    expect(rutas).toEqual(["nuevo.ts"]);
    rmSync(path.join(raiz, "nuevo.ts"));
  });

  it("el CLI sale con 1 si hay hallazgos, sin imprimir el valor, y con 0 si no", () => {
    const cli = path.resolve("scripts/escanear-secretos.mjs");
    const conHistorial = spawnSync("node", [cli, "--raiz", raiz, "--historial"], { encoding: "utf8" });
    expect(conHistorial.status).toBe(1);
    expect(conHistorial.stderr).toContain("[aws] src/config.ts:2");
    expect(conHistorial.stderr).not.toContain(AWS);
    const soloArbol = spawnSync("node", [cli, "--raiz", raiz], { encoding: "utf8" });
    expect(soloArbol.status).toBe(0);
    expect(soloArbol.stdout).toContain("Sin secretos");
  });
});

describe("este repositorio", () => {
  it("ningún archivo versionado contiene secretos", async () => {
    const hallazgos = await escanearArbol(await raizDelRepositorio());
    expect(hallazgos, JSON.stringify(hallazgos, null, 2)).toEqual([]);
  });
});
