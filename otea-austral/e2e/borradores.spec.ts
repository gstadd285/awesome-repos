import { createHash, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { SESION_ADMIN, vigilarErrores } from "./ayudas";
import { URL_API_FALSA, URL_IA } from "./puertos";

/**
 * Borradores con IA y su revisión (F5, `docs/alertas-reales.md` §4 y §5). La instancia 3201 hace de `otea-tareas` con los
 * borradores activos contra el servidor que imita a Anthropic (3299): nada sale a internet ni se gasta. El registro de
 * fuentes es el real, en el que **ninguna fuente tiene `lectura_ia`**: la corrida recorre el camino de la IA y al
 * «proveedor» no le llega nada. La revisión en el panel (3200) se prueba con un borrador SINTÉTICO, escrito en la base como
 * lo deja la redacción (la redacción completa, con fuentes que sí lo permiten, la prueba `src/lib/borradores/integracion.test.ts`).
 *
 * DATOS DE PRUEBA: títulos «(ejemplo)», enlaces de example.org.
 */
const SECRETO = process.env.E2E_TAREAS_SECRETO;
test.skip(!process.env.DATABASE_URL || !SECRETO, "Necesita DATABASE_URL (el panel y la instancia de tareas usan la base).");

const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Recibida = { borrador: boolean; titulos: string[]; documentos: number; mensaje?: string; clave: string };
const recibidas = async (): Promise<Recibida[]> => (await (await fetch(`${URL_API_FALSA}/__solicitudes`)).json()) as Recibida[];

async function conBase<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

/** Un evento como lo deja la agrupación (en una transacción, para que otra corrida no lo tome a medias). */
async function eventoDePrueba(items: { fuente: string; titulo: string }[], puntaje = 90): Promise<string> {
  return conBase(async (c) => {
    await c.query("begin");
    const id = randomUUID();
    await c.query(
      `insert into eventos_candidatos (id, tema, titulo_referencia, primero, ultimo, puntaje)
       values ($1, 'divisas', $2, now() - interval '1 hour', now(), $3)`,
      [id, items[0].titulo, puntaje],
    );
    for (const [i, item] of items.entries()) {
      const { rows } = await c.query(
        `insert into fuente_items (source_id, feed_url, clave, titulo, url, identificador, publicado)
         values ($1, 'https://example.org/e2e/feed.xml', $2, $3, $4, $5, now() - interval '1 hour') returning id`,
        [item.fuente, createHash("sha256").update(`${id}-${i}`).digest("hex"), item.titulo, `https://example.org/e2e/${sufijo}/borrador-${i}`, `folio-${i + 1}`],
      );
      await c.query("update fuente_items set evento_id = $1 where id = $2", [id, rows[0].id]);
    }
    await c.query("commit");
    return id;
  });
}

/** DATOS DE PRUEBA: un borrador sintético, revisado, como lo deja la redacción (borrador pendiente y evento con borrador). */
async function borradorDePrueba(eventoId: string, evento: string): Promise<string> {
  return conBase(async (c) => {
    await c.query("begin");
    const contenido = {
      evento,
      resumen: "Resumen de prueba escrito como lo haría el modelo, con palabras propias y sin datos reales.",
      filas: [{ sector: "Bancos de prueba", direccion: "condicionado", condicion: "Si la decisión de prueba se confirma, los márgenes podrían mantenerse." }],
      impacto_sugerido: "medio",
      dudas: [`Comprobar la fecha en el documento oficial de prueba ${sufijo}.`],
    };
    const { rows } = await c.query(
      `insert into borradores (evento_id, contenido, modelo, entrada_tokens, salida_tokens, cache_tokens, costo_micros, copia_proporcion,
         copia_tramo, documentos, banderas)
       values ($1, $2::jsonb, 'claude-haiku-5-5', 2400, 420, 0, 450, 0.031, 4, 1, '{fuentes_sin_lectura}') returning id`,
      [eventoId, JSON.stringify(contenido)],
    );
    await c.query("update eventos_candidatos set estado = 'con_borrador' where id = $1", [eventoId]);
    await c.query("insert into borrador_intentos (evento_id, resultado, llamadas, costo_micros) values ($1, 'borrador', 1, 450)", [eventoId]);
    await c.query("commit");
    return rows[0].id as string;
  });
}

/** Una corrida en el servicio de tareas; si otra prueba tiene el turno, espera y reintenta. */
async function correrIngesta(request: APIRequestContext): Promise<Record<string, unknown>> {
  for (let i = 0; i < 20; i++) {
    const r = await request.post(`${URL_IA}/api/tareas/ingesta`, { headers: { "x-otea-tarea": SECRETO! } });
    expect(r.status()).toBe(200);
    const cuerpo = (await r.json()) as Record<string, unknown>;
    if (cuerpo.resultado !== "omitida") return cuerpo;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error("La ingesta siguió ocupada");
}

test.describe("borradores con IA", () => {
  test("con la IA activa, una corrida no le manda al modelo nada de una fuente sin lectura_ia (hoy, todas)", async ({ request }) => {
    const marca = `MARCA-SIN-LECTURA-${sufijo}`;
    const id = await eventoDePrueba([
      { fuente: "bcch", titulo: `Decisión de tasa de prueba ${marca} (ejemplo)` },
      { fuente: "fed", titulo: `Comunicado de tasa de prueba ${marca} (ejemplo)` },
    ]);
    const antes = (await recibidas()).length;
    const cuerpo = await correrIngesta(request);
    expect(cuerpo).toMatchObject({ resultado: "ok", borradores: 0, ia: "ok" });
    const nuevas = (await recibidas()).slice(antes);
    expect(nuevas.filter((s) => s.borrador)).toEqual([]);
    expect(JSON.stringify(nuevas)).not.toContain(marca);
    const estado = await conBase(async (c) => (await c.query("select estado from eventos_candidatos where id = $1", [id])).rows[0].estado);
    expect(estado).toBe("abierto");
    const intentos = await conBase(async (c) => (await c.query("select count(*)::int as n from borrador_intentos where evento_id = $1", [id])).rows[0].n);
    expect(intentos).toBe(0);
  });

  test.describe("revisión en el panel", () => {
    test.use({ storageState: SESION_ADMIN });

    test("sin lectura_ia el evento queda para la cola manual y lo dice; no se puede pedir un borrador", async ({ page }) => {
      const titulo = `Aviso de tasa de prueba ${sufijo} sin lectura (ejemplo)`;
      await eventoDePrueba([{ fuente: "bcch", titulo }], 30);
      await page.goto("/admin/eventos");
      await page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: titulo }) }).getByRole("link", { name: "Revisar y crear alerta" }).click();
      await expect(page.getByText(/Ninguna fuente de este evento permite la lectura con IA \(lectura_ia\)/)).toBeVisible();
      await expect(page.getByRole("form", { name: "Pedir borrador con IA" })).toHaveCount(0);
      await expect(page.getByRole("form", { name: "Crear alerta desde el evento" })).toBeVisible();
    });

    test("la dueña ve el borrador junto a sus fuentes, lo edita y lo acepta: nace una alerta en borrador, real, con sus fuentes", async ({ page }) => {
      const errores = vigilarErrores(page);
      const titulo = `Decisión de tasa de prueba ${sufijo} con borrador (ejemplo)`;
      const propuesta = `Borrador de prueba ${sufijo}: el banco mantiene su tasa`;
      const eventoId = await eventoDePrueba([
        { fuente: "bcch", titulo },
        { fuente: "fed", titulo: `Comunicado de prueba ${sufijo} sobre la tasa (ejemplo)` },
      ]);
      const borradorId = await borradorDePrueba(eventoId, propuesta);

      await test.step("el tablero cuenta el borrador pendiente y el gasto de la IA", async () => {
        await page.goto("/admin");
        await expect(page.getByRole("heading", { name: "Gasto de la IA" })).toBeVisible();
        await expect(page.getByRole("region", { name: "Cola" })).toContainText(/\d+ borrador(es)? con IA por revisar/);
        await expect(page.getByRole("region", { name: "Gasto de la IA" })).toContainText("Toda la IA (asistente y borradores) desde el primer día");
      });

      await test.step("la cola muestra el borrador con su anticopia, sus banderas y las dudas", async () => {
        await page.goto("/admin/eventos");
        const tarjeta = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: titulo }) });
        await expect(tarjeta).toContainText("Con borrador");
        await expect(tarjeta).toContainText("Borrador con IA");
        await expect(tarjeta).toContainText(`Propone: «${propuesta}»`);
        await expect(tarjeta).toContainText("3,1 % de 5-gramas en común");
        await expect(tarjeta.getByRole("list", { name: "Banderas del borrador" })).toContainText("Hay fuentes que la IA no vio");
        await expect(tarjeta.getByRole("list", { name: "Dudas del modelo" })).toContainText(`documento oficial de prueba ${sufijo}`);
        await tarjeta.getByRole("link", { name: "Revisar y crear alerta" }).click();
        await expect(page).toHaveURL(new RegExp(`/admin/eventos/${eventoId}$`));
      });

      await test.step("el formulario trae el borrador con la confianza calculada de las fuentes (primaria → alta)", async () => {
        const form = page.getByRole("form", { name: "Aceptar el borrador con IA" });
        await expect(form.getByLabel("Evento")).toHaveValue(propuesta);
        await expect(form.getByLabel("Tema")).toHaveValue("divisas");
        await expect(form.getByLabel("Impacto")).toHaveValue("medio");
        await expect(form.locator('[name="fila_0_confianza"]')).toHaveValue("alta");
        await expect(form.getByRole("checkbox", { checked: true })).toHaveCount(2);
        // Las fuentes se abren en otra pestaña, sin opener ni referer.
        const enlace = page.getByRole("link", { name: new RegExp(`^${titulo.replace(/[()]/g, "\\$&")}`) }).first();
        await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
        await form.getByLabel("Resumen").fill(`Resumen editado por la dueña ${sufijo}, con palabras propias y sin datos reales.`);
        await form.getByRole("button", { name: "Crear alerta con este borrador" }).click();
      });

      await test.step("la alerta nace en borrador, real, con las dos fuentes y la nota del borrador en la auditoría", async () => {
        await expect(page).toHaveURL(/\/admin\/alertas\/[0-9a-f-]{36}\?hecho=desde-borrador$/);
        await expect(page.getByText("Alerta creada desde el borrador con IA, con sus fuentes enlazadas.")).toBeVisible();
        await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Datos de ejemplo")).toHaveCount(0);
        await expect(page.getByRole("table").last()).toContainText(`Desde borrador ${borradorId} · claude-haiku-5-5 · 2 fuentes`);
        const acciones = await page.getByRole("table").last().locator("tbody tr td:nth-child(2)").allTextContents();
        expect(acciones).toEqual(["Creada", "Editada", "Editada"]);
        const fila = await conBase(async (c) => (await c.query("select estado, alert_id from borradores where id = $1", [borradorId])).rows[0]);
        expect(fila.estado).toBe("aceptado");
        expect(page.url()).toContain(fila.alert_id);
      });

      await test.step("el evento convertido sale de la cola; nada se publicó solo", async () => {
        await page.goto("/admin/eventos");
        await expect(page.getByRole("heading", { name: titulo })).toHaveCount(0);
        const estado = await conBase(async (c) => (await c.query("select a.estado from alertas a join eventos_candidatos e on e.alert_id = a.id where e.id = $1", [eventoId])).rows[0].estado);
        expect(estado).toBe("borrador");
      });
      expect(errores).toEqual([]);
    });

    test("descartar el borrador pide un motivo, queda en la auditoría y el evento sigue en la cola", async ({ page }) => {
      const titulo = `Decisión de tasa de prueba ${sufijo} para descartar (ejemplo)`;
      const eventoId = await eventoDePrueba([{ fuente: "bcch", titulo }]);
      await borradorDePrueba(eventoId, `Borrador de prueba ${sufijo} que se descarta`);
      await page.goto(`/admin/eventos/${eventoId}`);
      const form = page.getByRole("form", { name: "Descartar el borrador con IA" });
      await form.getByLabel("Motivo").selectOption("impreciso");
      await form.getByLabel("Nota (interna, opcional)").fill("Prueba de navegador: faltaba la fecha.");
      await form.getByRole("button", { name: "Descartar borrador" }).click();
      await expect(page.getByText("Borrador con IA descartado. Queda en la auditoría; el evento sigue en la cola.")).toBeVisible();
      await expect(page.getByRole("form", { name: "Aceptar el borrador con IA" })).toHaveCount(0);
      await expect(page.getByText(/Este evento ya tuvo su borrador con IA \(descartado: impreciso/)).toBeVisible();
      await expect(page.getByRole("table").last()).toContainText("Borrador con IA descartado");
      await expect(page.getByRole("table").last()).toContainText("motivo: impreciso · Prueba de navegador: faltaba la fecha.");
      await expect(page.getByRole("form", { name: "Crear alerta desde el evento" })).toBeVisible();
    });
  });
});
