import { describe, expect, it } from "vitest";
import {
  agrupar,
  CIERRE_MS,
  fechaDeItem,
  puntajeDe,
  senalesDeEvento,
  temaDeItem,
  VENTANA_MS,
  type EventoAbierto,
  type FuenteAgrupable,
  type ItemNuevo,
} from "./agrupar";
import { claveDeAgenda, palabrasSignificativas, similitud, tieneDecision, tokens } from "./lexico";

// DATOS DE PRUEBA: organismos «(ejemplo)» y títulos sintéticos; ningún título copia uno real.
const FUENTES: FuenteAgrupable[] = [
  { id: "banco-a", organismo: "Banco de prueba A (ejemplo)", temas: ["divisas"], prioridad: "A" },
  { id: "banco-b", organismo: "Banco de Prueba  B (ejemplo)", temas: ["divisas"], prioridad: "B" },
  { id: "banco-b-bis", organismo: "banco de prueba b (ejemplo) ", temas: ["divisas"], prioridad: "C" },
  { id: "minero", organismo: "Comisión minera (ejemplo)", temas: ["cobre"], prioridad: "A" },
  { id: "general", organismo: "Ministerio de prueba (ejemplo)", temas: [], prioridad: "C" },
  { id: "doble", organismo: "Tesoro de prueba (ejemplo)", temas: ["divisas", "comercio_eeuu_china"], prioridad: "B" },
];

const T0 = new Date("2026-10-20T15:00:00Z");
const h = (horas: number) => new Date(T0.getTime() + horas * 3_600_000);

let n = 0;
function item(sourceId: string, titulo: string, horas: number | null, vistoHoras = horas ?? 0): ItemNuevo {
  n += 1;
  return { id: `item-${String(n).padStart(3, "0")}`, sourceId, titulo, publicado: horas === null ? null : h(horas), visto: h(vistoHoras) };
}

/** Generador determinista, como el `Contexto` de `rules.ts` en las pruebas. */
function contador(prefijo = "evento") {
  let i = 0;
  return () => `${prefijo}-${++i}`;
}

function agruparEn(items: ItemNuevo[], { abiertos = [] as EventoAbierto[], ahora = h(4) } = {}) {
  return agrupar({ items, abiertos, fuentes: FUENTES, ahora, generarId: contador() });
}

/** Ítems por evento, con sus títulos, para leer las pruebas de un vistazo. */
function grupos(r: ReturnType<typeof agrupar>, items: readonly ItemNuevo[]): string[][] {
  const titulo = new Map(items.map((i) => [i.id, i.titulo]));
  const por = new Map<string, string[]>();
  for (const a of r.asignaciones) por.set(a.eventoId, [...(por.get(a.eventoId) ?? []), titulo.get(a.itemId)!]);
  return [...por.values()];
}

describe("léxico: normalización y palabras significativas", () => {
  it("sin tildes, en minúsculas, con OPEP+ entero y el singular igual al plural", () => {
    expect(tokens("Aranceles, TASAS y rates: decisión de la OPEP+")).toEqual(["arancel", "tasa", "y", "rate", "decision", "de", "la", "opep+"]);
    expect(tokens("Sanciones / sanción")).toEqual(["sancion", "sancion"]);
  });

  it("deja fuera vacías, palabras cortas, cifras sueltas y la marca «(ejemplo)» de los datos de prueba", () => {
    expect([...palabrasSignificativas("Comunicado de prueba 1 (ejemplo): decisión de tasa 2026")]).toEqual([
      "comunicado",
      "prueba",
      "decision",
      "tasa",
    ]);
  });

  it.each([
    ["Decisión de tasa de política monetaria", "Comunicado sobre la decisión de tasa de política monetaria", 4 / 5],
    ["Precio del cobre", "Precio del petróleo", 1 / 3],
    ["Informe mensual", "", 0],
  ])("Jaccard de «%s» y «%s» = %s", (a, b, esperado) => {
    expect(similitud(palabrasSignificativas(a), palabrasSignificativas(b))).toBeCloseTo(esperado, 5);
  });

  it.each([
    ["Rate decision of the committee (example)", true],
    ["Recorte de producción acordado (ejemplo)", true],
    ["Nuevas sanciones financieras (ejemplo)", true],
    ["Cuotas de exportación (ejemplo)", true],
    ["Informe trimestral de estabilidad (ejemplo)", false],
  ])("palabras de decisión en «%s»: %s", (titulo, esperado) => {
    expect(tieneDecision(titulo)).toBe(esperado);
  });

  it.each([
    ["FOMC statement (example)", "fomc"],
    ["Minutes of the Federal Open Market Committee (example)", "fomc"],
    ["Reunión de Política Monetaria de octubre (ejemplo)", "rpm"],
    ["Informe de Política Monetaria (IPoM) de septiembre (ejemplo)", "ipom"],
    ["Índice de Precios al Consumidor de septiembre (ejemplo)", "ipc"],
    ["Consumer Price Index summary (example)", "cpi"],
    ["The Employment Situation, September (example)", "employment_situation"],
    ["Reunión ministerial de la OPEP+ (ejemplo)", "opep_reunion"],
    ["OPEC+ production levels (example)", null],
    ["World Economic Outlook update (example)", "weo"],
    ["Tasa de desempleo trimestral (ejemplo)", null],
  ])("clave de agenda de «%s»: %s", (titulo, clave) => {
    expect(claveDeAgenda(titulo)).toBe(clave);
  });
});

describe("tema de un ítem: temas de la fuente afinados por el léxico", () => {
  it.each([
    ["Aranceles de EE. UU. a productos de China (ejemplo)", [], "comercio_eeuu_china"],
    ["Sanciones y aranceles nuevos (ejemplo)", ["divisas", "comercio_eeuu_china"], "comercio_eeuu_china"],
    ["Precio del cobre refinado (ejemplo)", ["divisas"], "cobre"],
    ["Informe mensual (ejemplo)", ["divisas"], "divisas"],
    ["Informe mensual (ejemplo)", ["cobre", "energia"], "sin_tema"],
    ["Informe mensual (ejemplo)", [], "sin_tema"],
    ["Precio del cobre y del petróleo (ejemplo)", [], "sin_tema"],
  ] as const)("«%s» con temas %j ⇒ %s", (titulo, temas, tema) => {
    expect(temaDeItem(titulo, temas)).toBe(tema);
  });
});

describe("puntaje 0–100 con señales simples", () => {
  it.each([
    [{ organismos: 1, decision: false, prioridad: null, agenda: false, reciente: false }, 0],
    [{ organismos: 1, decision: false, prioridad: "C", agenda: false, reciente: false }, 5],
    [{ organismos: 2, decision: false, prioridad: "B", agenda: true, reciente: false }, 55],
    [{ organismos: 2, decision: true, prioridad: "A", agenda: false, reciente: true }, 80],
    [{ organismos: 4, decision: true, prioridad: "A", agenda: true, reciente: true }, 100],
  ] as const)("%j ⇒ %i", (senales, puntaje) => {
    expect(puntajeDe(senales)).toBe(puntaje);
  });

  it("los organismos se comparan sin tildes, mayúsculas ni espacios extra; la prioridad es la más alta", () => {
    const s = senalesDeEvento(
      [
        { sourceId: "banco-b", titulo: "Aviso (ejemplo)", fecha: h(0) },
        { sourceId: "banco-b-bis", titulo: "Aviso (ejemplo)", fecha: h(1) },
        { sourceId: "fuente-retirada", titulo: "Aviso (ejemplo)", fecha: h(2) },
      ],
      null,
      FUENTES,
      h(10),
    );
    expect(s).toEqual({ organismos: 2, decision: false, prioridad: "B", agenda: false, reciente: false });
  });
});

describe("agrupar en eventos candidatos", () => {
  it("criterio de aceptación: los ítems de una misma decisión de tasas forman un evento, aunque vengan de dos organismos", () => {
    const items = [
      item("banco-a", "Decisión de tasa de política monetaria de octubre (ejemplo)", 0),
      item("banco-b", "Comunicado sobre la decisión de tasa de política monetaria (ejemplo)", 3),
      item("minero", "Producción de cobre de septiembre (ejemplo)", 1),
    ];
    const r = agruparEn(items);
    expect(grupos(r, items)).toEqual([
      ["Decisión de tasa de política monetaria de octubre (ejemplo)", "Comunicado sobre la decisión de tasa de política monetaria (ejemplo)"],
      ["Producción de cobre de septiembre (ejemplo)"],
    ]);
    expect(r.eventos).toEqual([
      {
        id: "evento-1",
        nuevo: true,
        tema: "divisas",
        claveAgenda: null,
        tituloReferencia: "Decisión de tasa de política monetaria de octubre (ejemplo)",
        primero: h(0),
        ultimo: h(3),
        // 2 organismos (+25), decisión (+30), prioridad A (+15), un ítem de las últimas 6 h (+10).
        puntaje: 80,
      },
      {
        id: "evento-2",
        nuevo: true,
        tema: "cobre",
        claveAgenda: null,
        tituloReferencia: "Producción de cobre de septiembre (ejemplo)",
        primero: h(1),
        ultimo: h(1),
        puntaje: 25,
      },
    ]);
  });

  it("mismo tema y títulos parecidos, pero fuera de la ventana de 48 h: dos eventos", () => {
    const items = [
      item("banco-a", "Decisión de tasa de política monetaria (ejemplo)", 0),
      item("banco-b", "Decisión de tasa de política monetaria (ejemplo)", VENTANA_MS / 3_600_000 + 1),
    ];
    expect(grupos(agruparEn(items, { ahora: h(60) }), items)).toHaveLength(2);
    const dentro = [item("banco-a", "Decisión de tasa (ejemplo)", 0), item("banco-b", "Decisión de tasa (ejemplo)", 48)];
    expect(grupos(agruparEn(dentro, { ahora: h(50) }), dentro)).toHaveLength(1);
  });

  it("títulos distintos del mismo tema y en la misma ventana: eventos distintos", () => {
    const items = [
      item("banco-a", "Decisión de tasa de política monetaria (ejemplo)", 0),
      item("banco-b", "Informe de estabilidad financiera del semestre (ejemplo)", 1),
    ];
    expect(grupos(agruparEn(items), items)).toHaveLength(2);
  });

  it("la misma clave de agenda une títulos que no se parecen; dos claves distintas nunca se unen", () => {
    const items = [
      item("banco-a", "FOMC statement (example)", 0),
      item("banco-b", "Minutes of the Federal Open Market Committee (example)", 2),
      item("banco-a", "Decisión de tasa de política monetaria: comunicado RPM (ejemplo)", 1),
      item("banco-b", "Decisión de tasa de política monetaria: comunicado FOMC (ejemplo)", 1.5),
    ];
    const r = agruparEn(items);
    expect(grupos(r, items)).toEqual([
      ["FOMC statement (example)", "Decisión de tasa de política monetaria: comunicado FOMC (ejemplo)", "Minutes of the Federal Open Market Committee (example)"],
      ["Decisión de tasa de política monetaria: comunicado RPM (ejemplo)"],
    ]);
    expect(r.eventos.map((e) => e.claveAgenda)).toEqual(["fomc", "rpm"]);
    // FOMC: 2 organismos (+25), decisión (+30), A (+15), agenda (+20) y reciente (+10).
    expect(r.eventos[0].puntaje).toBe(100);
  });

  it("un evento abierto recibe los ítems nuevos y ensancha su ventana; a las 72 h se cierra", () => {
    const abierto: EventoAbierto = {
      id: "existente",
      tema: "divisas",
      claveAgenda: null,
      primero: h(0),
      ultimo: h(2),
      items: [{ sourceId: "banco-a", titulo: "Decisión de tasa de política monetaria (ejemplo)", fecha: h(0) }],
    };
    const nuevo = [item("banco-b", "Comunicado de la decisión de tasa de política monetaria (ejemplo)", 30)];
    const r = agruparEn(nuevo, { abiertos: [abierto], ahora: h(31) });
    expect(r.asignaciones).toEqual([{ itemId: nuevo[0].id, eventoId: "existente" }]);
    expect(r.eventos).toEqual([
      { id: "existente", nuevo: false, tema: "divisas", claveAgenda: null, tituloReferencia: null, primero: h(0), ultimo: h(30), puntaje: 80 },
    ]);

    // El mismo ítem, ya pasadas 72 h del primero (llegó tarde): el evento cerrado no lo recibe.
    const tarde = agruparEn(nuevo, { abiertos: [abierto], ahora: new Date(h(0).getTime() + CIERRE_MS + 60_000) });
    expect(tarde.asignaciones).toEqual([{ itemId: nuevo[0].id, eventoId: "evento-1" }]);
    expect(tarde.eventos.map((e) => [e.id, e.nuevo])).toEqual([["evento-1", true]]);
  });

  it("sin tema claro va a la cola como `sin_tema` y también se agrupa por títulos", () => {
    const items = [
      item("general", "Boletín de prueba de la semana (ejemplo)", 0),
      item("general", "Boletín de prueba de la semana, segunda edición (ejemplo)", 5),
    ];
    const r = agruparEn(items, { ahora: h(30) });
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0]).toMatchObject({ tema: "sin_tema", puntaje: 5 });
  });

  it("sin fecha del feed usa la de la ingesta", () => {
    const sinFecha = item("banco-a", "Decisión de tasa (ejemplo)", null, 2);
    expect(fechaDeItem(sinFecha)).toEqual(h(2));
    expect(agruparEn([sinFecha]).eventos[0]).toMatchObject({ primero: h(2), ultimo: h(2) });
  });

  it("es determinista: el orden de llegada no cambia los eventos ni las asignaciones", () => {
    const items = [
      item("banco-a", "Decisión de tasa de política monetaria (ejemplo)", 0),
      item("banco-b", "Comunicado de la decisión de tasa de política monetaria (ejemplo)", 0),
      item("minero", "Producción de cobre del mes (ejemplo)", 1),
      item("minero", "Producción de cobre del mes, cifras revisadas (ejemplo)", 2),
      item("doble", "Aranceles a importaciones de China (ejemplo)", 3),
      item("general", "Boletín semanal (ejemplo)", null, 1),
    ];
    const ordenado = agruparEn(items);
    const alReves = agruparEn([...items].reverse());
    const barajado = agruparEn([items[3], items[0], items[5], items[1], items[4], items[2]]);
    expect(alReves).toEqual(ordenado);
    expect(barajado).toEqual(ordenado);
    expect(ordenado.eventos.map((e) => e.tema)).toEqual(["divisas", "cobre", "sin_tema", "comercio_eeuu_china"]);
  });

  it("sin ítems no hay nada que guardar", () => {
    expect(agruparEn([])).toEqual({ eventos: [], asignaciones: [] });
  });
});
