// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVISOS_DE_IA, MENSAJES_DE_FALLO, SALUDO_INICIAL } from "@/lib/asistente/cliente";
import { MAX_PREGUNTA, RUTA_ASISTENTE, type EventoAsistente } from "@/lib/asistente/limites";
import { AsistenteChat, frases } from "./AsistenteChat";

const SUGERIDAS = ["¿Cómo calculan la confianza?", "¿Qué fuentes usan?"];

const ndjson = (eventos: EventoAsistente[]) => eventos.map((e) => `${JSON.stringify(e)}\n`).join("");

const baseCompleta = (texto: string, extra: EventoAsistente[] = []): EventoAsistente[] => [
  { t: "inicio", modo: "base", coincidencia: "¿Cómo calculan la confianza?" },
  { t: "texto", d: texto },
  { t: "fuentes", items: [{ titulo: "Metodología", href: "/metodologia" }] },
  { t: "sugerencias", items: ["¿Qué fuentes usan?"] },
  ...extra,
  { t: "fin" },
];

const respuesta = (eventos: EventoAsistente[], estado = 200) =>
  new Response(ndjson(eventos), { status: estado, headers: { "Content-Type": "application/x-ndjson" } });

/** Un `fetch` que responde con lo que se le va entregando, en orden. */
function simularFetch(...respuestas: (Response | (() => Response | Promise<Response>))[]) {
  const mock = vi.fn<typeof fetch>(async () => {
    const siguiente = respuestas.shift();
    if (!siguiente) throw new Error("fetch sin respuesta preparada");
    return typeof siguiente === "function" ? siguiente() : siguiente;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Una respuesta que se va escribiendo a mano; si la solicitud se cancela, el flujo se corta como en un fetch real. */
function simularFlujoManual() {
  const codificador = new TextEncoder();
  let controlador!: ReadableStreamDefaultController<Uint8Array>;
  const mock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        controlador = c;
        init?.signal?.addEventListener("abort", () => c.error(new DOMException("Cancelado", "AbortError")));
      },
    });
    return Promise.resolve(new Response(cuerpo, { status: 200 }));
  });
  vi.stubGlobal("fetch", mock);
  return {
    mock,
    escribir: (evento: EventoAsistente) => controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`)),
    cerrar: () => controlador.close(),
  };
}

const cuerpoDe = (mock: ReturnType<typeof simularFetch>, n: number) =>
  JSON.parse(String(mock.mock.calls[n][1]?.body)) as { pregunta: string; anteriores?: string[] };

function montar(modo: "base" | "ia" = "base") {
  return render(<AsistenteChat modo={modo} sugeridas={SUGERIDAS} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AsistenteChat · inicio", () => {
  it("empieza con un saludo, los atajos y un registro de conversación accesible", () => {
    montar();
    const registro = screen.getByRole("log", { name: "Conversación con el asistente" });
    expect(registro).toHaveAttribute("aria-busy", "false");
    expect(within(registro).getByText(SALUDO_INICIAL)).toBeInTheDocument();
    for (const p of SUGERIDAS) expect(within(registro).getByRole("button", { name: p })).toBeEnabled();
    expect(screen.getByLabelText("Tu pregunta")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeEnabled();
  });

  it("en el servidor (y sin JavaScript) los controles salen desactivados: nada se pierde antes de hidratar", () => {
    const html = renderToString(<AsistenteChat modo="base" sugeridas={SUGERIDAS} />);
    const documento = new DOMParser().parseFromString(html, "text/html");
    expect(documento.querySelector("textarea")?.hasAttribute("disabled")).toBe(true);
    expect(documento.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true);
    for (const atajo of documento.querySelectorAll("ul button")) expect(atajo.hasAttribute("disabled")).toBe(true);
  });

  it("el campo limita la pregunta al máximo que acepta el servidor", () => {
    montar();
    expect(screen.getByLabelText("Tu pregunta")).toHaveAttribute("maxlength", String(MAX_PREGUNTA));
  });

  it("dice qué modo es y enlaza las condiciones de uso y la privacidad", () => {
    montar("base");
    expect(screen.getByText("Preguntas frecuentes, sin IA")).toBeInTheDocument();
    expect(screen.queryByText(/Anthropic/)).toBeNull();
    expect(screen.getByRole("link", { name: "condiciones de uso" })).toHaveAttribute("href", "/terminos");
    expect(screen.getByRole("link", { name: "política de privacidad" })).toHaveAttribute("href", "/privacidad");
  });

  it("en modo IA avisa que la respuesta la redacta un modelo, que puede equivocarse y quién recibe la pregunta", () => {
    montar("ia");
    expect(screen.getByText("Con IA y filtros de lenguaje")).toBeInTheDocument();
    expect(screen.getByText(/pueden tener errores/)).toBeInTheDocument();
    expect(screen.getByText(/se envía a Anthropic/)).toBeInTheDocument();
  });

  it("no deja atributos style en el HTML (la CSP los bloquea)", () => {
    const { container } = montar();
    expect(container.querySelector("[style]")).toBeNull();
  });
});

describe("AsistenteChat · preguntar", () => {
  it("un atajo hace la pregunta y muestra la respuesta, la pregunta frecuente, los enlaces y las sugerencias", async () => {
    const mock = simularFetch(respuesta(baseCompleta("Se calcula desde las fuentes.")));
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "¿Cómo calculan la confianza?" }));

    expect(await screen.findByText("Se calcula desde las fuentes.")).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).toBe(RUTA_ASISTENTE);
    expect(mock.mock.calls[0][1]?.method).toBe("POST");
    expect(cuerpoDe(mock, 0)).toEqual({ pregunta: "¿Cómo calculan la confianza?", anteriores: [] });

    const registro = screen.getByRole("log");
    expect(within(registro).getByText("Pregunta frecuente: «¿Cómo calculan la confianza?»")).toBeInTheDocument();
    expect(within(registro).getByRole("link", { name: "Metodología" })).toHaveAttribute("href", "/metodologia");
    expect(within(registro).getByRole("button", { name: "¿Qué fuentes usan?" })).toBeEnabled();
    expect(registro).toHaveAttribute("aria-busy", "false");
    // Quien lee con un lector de pantalla sabe quién dice qué.
    expect(within(registro).getByText("Tú:", { exact: false })).toHaveClass("sr-only");
    // Los atajos de bienvenida ya no están: la conversación empezó.
    expect(within(registro).queryByText("Prueba con")).toBeNull();
  });

  it("Enter envía y Mayús + Enter agrega una línea; la pregunta sale sin saltos ni espacios de sobra", async () => {
    const mock = simularFetch(respuesta(baseCompleta("Listo.")));
    const user = userEvent.setup();
    montar();
    const campo = screen.getByLabelText("Tu pregunta");

    await user.type(campo, "  ¿Cómo   funciona{Shift>}{Enter}{/Shift}  el sitio?  ");
    expect(campo).toHaveValue("  ¿Cómo   funciona\n  el sitio?  ");
    expect(mock).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(await screen.findByText("Listo.")).toBeInTheDocument();
    expect(cuerpoDe(mock, 0).pregunta).toBe("¿Cómo funciona el sitio?");
    expect(campo).toHaveValue("");
  });

  it("una pregunta en blanco no se envía", async () => {
    const mock = simularFetch();
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText("Tu pregunta"), "   ");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(mock).not.toHaveBeenCalled();
  });

  it("un atajo no borra lo que la persona estaba escribiendo", async () => {
    simularFetch(respuesta(baseCompleta("Respuesta.")));
    const user = userEvent.setup();
    montar();
    const campo = screen.getByLabelText("Tu pregunta");
    await user.type(campo, "Un borrador");
    await user.click(screen.getByRole("button", { name: "¿Qué fuentes usan?" }));
    await screen.findByText("Respuesta.");
    expect(campo).toHaveValue("Un borrador");
  });

  it("solo viajan como contexto las dos últimas preguntas, nunca las respuestas", async () => {
    const mock = simularFetch(
      ...Array.from({ length: 4 }, (_, i) => respuesta(baseCompleta(`Respuesta ${i + 1}.`))),
    );
    const user = userEvent.setup();
    montar();
    const campo = screen.getByLabelText("Tu pregunta");

    for (let i = 1; i <= 4; i++) {
      await user.type(campo, `Pregunta ${i}`);
      await user.keyboard("{Enter}");
      await screen.findByText(`Respuesta ${i}.`);
    }

    expect(cuerpoDe(mock, 0).anteriores).toEqual([]);
    expect(cuerpoDe(mock, 1).anteriores).toEqual(["Pregunta 1"]);
    expect(cuerpoDe(mock, 2).anteriores).toEqual(["Pregunta 1", "Pregunta 2"]);
    expect(cuerpoDe(mock, 3).anteriores).toEqual(["Pregunta 2", "Pregunta 3"]);
    // Las sugerencias solo se ofrecen en la última respuesta.
    expect(screen.getAllByRole("button", { name: "¿Qué fuentes usan?" })).toHaveLength(1);
  });

  it("muestra la respuesta a medida que llega y avisa a los lectores de pantalla cuando termina", async () => {
    const flujo = simularFlujoManual();
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));

    const registro = screen.getByRole("log");
    await waitFor(() => expect(registro).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("button", { name: "Detener" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("El asistente está escribiendo la respuesta.");
    expect(screen.getByText("Buscando la respuesta…")).toBeInTheDocument();

    flujo.escribir({ t: "inicio", modo: "ia" });
    flujo.escribir({ t: "texto", d: "Primera frase. " });
    expect(await screen.findByText(/Primera frase\./)).toBeInTheDocument();
    expect(screen.getByText("Respuesta con IA")).toBeInTheDocument();
    expect(screen.queryByText("Buscando la respuesta…")).toBeNull();
    expect(registro).toHaveAttribute("aria-busy", "true");

    flujo.escribir({ t: "texto", d: "Segunda frase." });
    flujo.escribir({ t: "fin" });
    flujo.cerrar();
    await waitFor(() => expect(registro).toHaveAttribute("aria-busy", "false"));
    expect(registro).toHaveTextContent("Primera frase. Segunda frase.");
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("la respuesta llega por frases sin cambiar su texto: el párrafo dice lo mismo y nada lleva `style`", async () => {
    const texto = "Se calcula con las fuentes: nunca a mano. ¿Y si falta la primaria? Baja a media…\nFin";
    simularFetch(respuesta(baseCompleta(texto)));
    const user = userEvent.setup();
    const { container } = montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    const registro = screen.getByRole("log");
    await waitFor(() => expect(registro).toHaveAttribute("aria-busy", "false"));
    const piezas = [...registro.querySelectorAll(".frase")];
    expect(piezas.map((p) => p.textContent)).toEqual(frases(texto));
    expect(piezas[0].parentElement?.textContent).toBe(texto);
    // Escalonado con clases finitas (120 ms cada una, tope en la quinta), jamás `style`.
    expect(piezas.map((p) => p.className)).toEqual(["frase kx-i-0", "frase kx-i-1", "frase kx-i-2", "frase kx-i-3", "frase kx-i-4"]);
    expect(container.querySelectorAll(".mensaje")).toHaveLength(2);
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("mientras responde no se puede preguntar otra cosa", async () => {
    const flujo = simularFlujoManual();
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await screen.findByRole("button", { name: "Detener" });

    await user.type(screen.getByLabelText("Tu pregunta"), "Otra cosa");
    await user.keyboard("{Enter}");
    expect(flujo.mock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Tu pregunta")).toHaveValue("Otra cosa");
  });
});

describe("AsistenteChat · cuando algo falla", () => {
  it("si la IA falla, explica por qué y muestra la pregunta frecuente debajo de lo que alcanzó a escribir", async () => {
    simularFetch(
      respuesta([
        { t: "inicio", modo: "ia" },
        { t: "texto", d: "Una frase buena. " },
        { t: "error", codigo: "salida" },
        { t: "inicio", modo: "base", coincidencia: "¿Cómo calculan la confianza?" },
        { t: "texto", d: "Esto dicen las preguntas frecuentes." },
        { t: "fin" },
      ]),
    );
    const user = userEvent.setup();
    montar("ia");
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));

    const base = await screen.findByText("Esto dicen las preguntas frecuentes.");
    const aviso = screen.getByText(AVISOS_DE_IA.salida);
    const ia = screen.getByText("Una frase buena.");
    // Orden en pantalla: lo que escribió la IA, el aviso y la respuesta de la base.
    expect(ia.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aviso.compareDocumentPosition(base) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("si la IA falla antes de escribir, el aviso va arriba de la respuesta de la base y no queda un bloque vacío", async () => {
    simularFetch(
      respuesta([
        { t: "error", codigo: "limite" },
        ...baseCompleta("Respuesta de la base."),
      ]),
    );
    const user = userEvent.setup();
    montar("ia");
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await screen.findByText("Respuesta de la base.");
    const aviso = screen.getByText(AVISOS_DE_IA.limite);
    expect(aviso.compareDocumentPosition(screen.getByText("Respuesta de la base.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Respuesta con IA")).toBeNull();
  });

  it.each([
    [429, "limite"],
    [400, "invalida"],
    [500, "servidor"],
  ] as const)("si el servidor responde %i, lo dice y deja reintentar sin duplicar la pregunta", async (estado, tipo) => {
    const mock = simularFetch(
      new Response(JSON.stringify({ error: "x" }), { status: estado }),
      respuesta(baseCompleta("Ahora sí.")),
    );
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));

    expect(await screen.findByText(MENSAJES_DE_FALLO[tipo], { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Ahora sí.")).toBeInTheDocument();
    expect(screen.queryByText(MENSAJES_DE_FALLO[tipo], { exact: false })).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(cuerpoDe(mock, 1)).toEqual(cuerpoDe(mock, 0));
    expect(screen.getAllByText(SUGERIDAS[0], { selector: "div" })).toHaveLength(1);
  });

  it("sin conexión lo dice, y una respuesta cortada conserva lo que ya había llegado", async () => {
    const user = userEvent.setup();
    simularFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const { unmount } = montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    expect(await screen.findByText(MENSAJES_DE_FALLO.red, { exact: false })).toBeInTheDocument();
    unmount();

    // Una respuesta que se corta antes de su «fin».
    simularFetch(
      new Response(ndjson([{ t: "inicio", modo: "ia" }, { t: "texto", d: "Alcancé a decir esto." }]), { status: 200 }),
    );
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    expect(await screen.findByText(MENSAJES_DE_FALLO.cortada, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Alcancé a decir esto.")).toBeInTheDocument();
  });

  it("no muestra enlaces que no sean del propio sitio, aunque lleguen del servidor", async () => {
    simularFetch(
      respuesta([
        { t: "inicio", modo: "base" },
        { t: "texto", d: "Mira esto." },
        {
          t: "fuentes",
          items: [
            { titulo: "Propio", href: "/fuentes" },
            { titulo: "Ajeno", href: "https://ejemplo.com" },
            { titulo: "Código", href: "javascript:alert(1)" },
          ],
        },
        { t: "fin" },
      ]),
    );
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await screen.findByText("Mira esto.");
    expect(screen.getByRole("link", { name: "Propio" })).toHaveAttribute("href", "/fuentes");
    expect(screen.queryByRole("link", { name: "Ajeno" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Código" })).toBeNull();
  });
});

describe("AsistenteChat · control de la persona", () => {
  it("Detener corta la respuesta, conserva lo recibido y devuelve el control", async () => {
    const flujo = simularFlujoManual();
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await screen.findByRole("button", { name: "Detener" });
    flujo.escribir({ t: "inicio", modo: "ia" });
    flujo.escribir({ t: "texto", d: "Voy a la mitad. " });
    await screen.findByText(/Voy a la mitad\./);

    await user.click(screen.getByRole("button", { name: "Detener" }));

    expect(await screen.findByText("Detuviste la respuesta.")).toBeInTheDocument();
    expect(screen.getByText(/Voy a la mitad\./)).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeEnabled();
    // No se la trata como un error ni se ofrece reintentar.
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByText(MENSAJES_DE_FALLO.cortada, { exact: false })).toBeNull();
  });

  it("Borrar conversación deja el chat como al principio", async () => {
    simularFetch(respuesta(baseCompleta("Algo.")));
    const user = userEvent.setup();
    montar();
    expect(screen.queryByRole("button", { name: "Borrar conversación" })).toBeNull();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await screen.findByText("Algo.");

    await user.click(screen.getByRole("button", { name: "Borrar conversación" }));

    expect(screen.queryByText("Algo.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar conversación" })).toBeNull();
    expect(screen.getByRole("button", { name: SUGERIDAS[1] })).toBeEnabled();
    expect(screen.getByRole("log")).toHaveFocus();
  });

  it("al salir de la página cancela la respuesta que estaba en curso", async () => {
    let senal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        senal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    const user = userEvent.setup();
    const { unmount } = montar();
    await user.click(screen.getByRole("button", { name: SUGERIDAS[0] }));
    await waitFor(() => expect(senal).toBeDefined());
    expect(senal?.aborted).toBe(false);
    unmount();
    expect(senal?.aborted).toBe(true);
  });
});

describe("frases", () => {
  it("parte por la puntuación final y une sin perder un carácter", () => {
    for (const texto of ["", "Una sola frase", "Uno. Dos! Tres? Cuatro… Cinco: seis.", "«Cita.» Luego.\n\nOtra línea.", "Sin espacio.Final"]) {
      expect(frases(texto).join("")).toBe(texto);
    }
    expect(frases("Uno. Dos! Tres?")).toEqual(["Uno. ", "Dos! ", "Tres?"]);
    expect(frases("Dijo «sí.» Y siguió.")).toEqual(["Dijo «sí.» ", "Y siguió."]);
    expect(frases("Versión 2.5 del texto.")).toEqual(["Versión 2.5 del texto."]);
  });
});
