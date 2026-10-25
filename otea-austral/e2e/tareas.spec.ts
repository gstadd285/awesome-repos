import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { URL_IA } from "./puertos";

/**
 * Tareas programadas (`docs/alertas-reales.md` §2.1). El sitio público (3200) no tiene `TAREAS_MODO`: la ruta de la
 * ingesta responde 404 a todo, como una ruta inexistente. La segunda instancia (3201, con base de datos) hace de
 * `otea-tareas`: solo un POST sin cuerpo y con el secreto pasa, y la ingesta corre contra el registro real, que hoy no
 * tiene ningún feed verificado (no sale a internet y lo dice), y agrupa en eventos candidatos los ítems pendientes.
 */
const RUTA = "/api/tareas/ingesta";
const METODOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const SECRETO = process.env.E2E_TAREAS_SECRETO;

test.describe("ingesta de metadatos", () => {
  test("en el sitio público no existe: 404 con cualquier método, también con un secreto", async ({ request }) => {
    const inexistente = await request.post("/api/no-existe-ninguna-ruta");
    for (const method of METODOS) {
      const r = await request.fetch(RUTA, { method, headers: { "x-otea-tarea": SECRETO ?? "x".repeat(43) } });
      expect(r.status(), method).toBe(404);
      expect(r.headers().allow, method).toBeUndefined();
    }
    expect(inexistente.status()).toBe(404);
  });

  test.describe("servicio de tareas", () => {
    test.skip(!SECRETO, "Necesita DATABASE_URL (la instancia de tareas usa la base).");

    test("solo un POST sin cuerpo y con el secreto pasa; lo demás responde 404 como si no existiera", async ({ request }) => {
      const url = `${URL_IA}${RUTA}`;
      for (const method of METODOS.filter((m) => m !== "POST")) {
        expect((await request.fetch(url, { method, headers: { "x-otea-tarea": SECRETO! } })).status(), method).toBe(404);
      }
      expect((await request.post(url)).status()).toBe(404);
      expect((await request.post(url, { headers: { "x-otea-tarea": `${SECRETO}x` } })).status()).toBe(404);
      expect((await request.post(url, { headers: { "x-otea-tarea": SECRETO! }, data: { forzar: true } })).status()).toBe(404);
    });

    test("con el secreto corre la ingesta: hoy no hay feeds verificados, no lee nada, agrupa lo pendiente y responde solo conteos", async ({
      request,
    }) => {
      // DATOS DE PRUEBA: dos ítems sintéticos de una misma decisión de tasas (títulos «(ejemplo)», enlaces de example.org)
      // de dos organismos del registro, como si la ingesta los hubiera visto. La corrida los agrupa en un evento.
      const sufijo = randomUUID().slice(0, 8);
      const titulos = [
        `Decisión de tasa de política monetaria de prueba ${sufijo} (ejemplo)`,
        `Comunicado sobre la decisión de tasa de política monetaria de prueba ${sufijo} (ejemplo)`,
      ];
      const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await cliente.connect();
      try {
        for (const [i, [fuente, titulo]] of [["bcch", titulos[0]], ["fed", titulos[1]]].entries()) {
          await cliente.query(
            "insert into fuente_items (source_id, feed_url, clave, titulo, url, publicado) values ($1, $2, $3, $4, $5, now())",
            [fuente, "https://example.org/e2e/feed.xml", createHash("sha256").update(`${sufijo}-${i}`).digest("hex"), titulo, `https://example.org/e2e/${sufijo}/${i}`],
          );
        }

        const r = await request.post(`${URL_IA}${RUTA}`, { headers: { "x-otea-tarea": SECRETO! } });
        expect(r.status()).toBe(200);
        expect(r.headers()["cache-control"]).toBe("no-store");
        const cuerpo = await r.json();
        expect(cuerpo).toEqual({
          resultado: "ok",
          feeds: 0,
          nuevos: 0,
          fallos: 0,
          pausados: 0,
          sin_feeds: true,
          agrupados: expect.any(Number),
          eventos_nuevos: expect.any(Number),
        });
        expect(cuerpo.agrupados).toBeGreaterThanOrEqual(2);
        const { rows } = await cliente.query(
          `select i.evento_id, e.tema, e.puntaje from fuente_items i join eventos_candidatos e on e.id = i.evento_id
           where i.titulo = any($1::text[])`,
          [titulos],
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].evento_id).toBe(rows[1].evento_id);
        // Divisas; dos organismos (+25), decisión (+30), prioridad A (+15) y recientes (+10).
        expect(rows[0]).toMatchObject({ tema: "divisas", puntaje: 80 });
      } finally {
        await cliente.end();
      }
      // El turno se suelta al terminar: la siguiente corrida no queda omitida.
      const otra = await request.post(`${URL_IA}${RUTA}`, { headers: { "x-otea-tarea": SECRETO! } });
      expect((await otra.json()).resultado).toBe("ok");
    });
  });
});
