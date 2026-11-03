import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
const registrar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/waitlist/instance", () => ({ servicioLista: () => ({ registrar, confirmar: vi.fn() }) }));

import { unirseAListaDeEspera } from "./lista-de-espera";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.set(nombre, valor);
  return datos;
}

beforeEach(() => registrar.mockReset());

describe("unirseAListaDeEspera · lo escrito vuelve si el envío no prosperó", () => {
  it("una inscripción correcta no devuelve nada de lo escrito: el formulario se vacía", async () => {
    registrar.mockResolvedValue({ estado: "ok", prueba: false });
    const estado = await unirseAListaDeEspera(
      { estado: "inicial" },
      formulario({ correo: "persona@correo.cl", acepta: "on", condiciones: "on" }),
    );
    expect(estado).toEqual({ estado: "ok", prueba: false });
  });

  it("un error de validación devuelve el correo y qué casillas estaban marcadas", async () => {
    registrar.mockResolvedValue({ estado: "invalida", errores: { condiciones: "Falta." } });
    const estado = await unirseAListaDeEspera({ estado: "inicial" }, formulario({ correo: "persona@correo.cl", acepta: "on" }));
    expect(estado).toEqual({
      estado: "invalida",
      errores: { condiciones: "Falta." },
      valores: { correo: "persona@correo.cl", condiciones: false, acepta: true },
    });
  });

  it.each([
    { estado: "espera" },
    { estado: "limite" },
    { estado: "reintentar" },
    { estado: "saturada" },
    { estado: "cerrada" },
  ])("también con «$estado»: la persona no tiene que volver a escribir todo", async (resultado) => {
    registrar.mockResolvedValue(resultado);
    const estado = await unirseAListaDeEspera(
      { estado: "inicial" },
      formulario({ correo: "persona@correo.cl", acepta: "on", condiciones: "on" }),
    );
    expect(estado).toEqual({ ...resultado, valores: { correo: "persona@correo.cl", condiciones: true, acepta: true } });
  });

  it("solo devuelve esos tres valores: ni el campo trampa ni la marca de tiempo", async () => {
    registrar.mockResolvedValue({ estado: "espera" });
    const estado = await unirseAListaDeEspera(
      { estado: "inicial" },
      formulario({ correo: "persona@correo.cl", sitio_web: "https://spam.example", tiempo: "123.firma" }),
    );
    expect(JSON.stringify(estado)).not.toMatch(/spam|firma|sitio_web|tiempo/);
    expect(Object.keys((estado as { valores: object }).valores).sort()).toEqual(["acepta", "condiciones", "correo"]);
  });

  it("recorta el correo al largo máximo y no devuelve nada si no es texto", async () => {
    registrar.mockResolvedValue({ estado: "invalida", errores: {} });
    const largo = await unirseAListaDeEspera({ estado: "inicial" }, formulario({ correo: "a".repeat(400) }));
    expect((largo as { valores: { correo: string } }).valores.correo).toHaveLength(254);

    const archivo = new FormData();
    archivo.set("correo", new File(["x"], "x.txt"));
    const sinTexto = await unirseAListaDeEspera({ estado: "inicial" }, archivo);
    expect((sinTexto as { valores: { correo: string } }).valores.correo).toBe("");
  });

  it("pasa al servicio los cinco campos y una huella de la IP, no la IP", async () => {
    registrar.mockResolvedValue({ estado: "ok", prueba: true });
    await unirseAListaDeEspera(
      { estado: "inicial" },
      formulario({ correo: "persona@correo.cl", acepta: "on", condiciones: "on", sitio_web: "", tiempo: "1.x" }),
    );
    const [entrada, clave] = registrar.mock.calls[0];
    expect(Object.keys(entrada).sort()).toEqual(["acepta", "condiciones", "correo", "sitio_web", "tiempo"]);
    expect(clave).toMatch(/^[0-9a-f]{64}$/);
    expect(clave).not.toContain("203.0.113.7");
  });
});
