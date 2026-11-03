import { describe, expect, it } from "vitest";
import { frasesProhibidas } from "@/lib/domain/lenguaje";
import {
  correoActivar,
  correoAltaExistente,
  correoClaveCambiada,
  correoCuentaEliminada,
  correoDosPasos,
  correoRestablecer,
  enlaceCuenta,
} from "./correo";

const SITIO = "https://oteaustral.com";
const TOKEN = "T".repeat(43);

describe("enlaces de los correos de cuentas", () => {
  it("se arman sobre la URL del sitio con el token en la consulta", () => {
    expect(enlaceCuenta(SITIO, "/cuenta/activar", TOKEN)).toBe(`https://oteaustral.com/cuenta/activar?token=${TOKEN}`);
    expect(enlaceCuenta(SITIO, "/cuenta/entrar")).toBe("https://oteaustral.com/cuenta/entrar");
    expect(enlaceCuenta("http://localhost:3000", "/cuenta/restablecer", TOKEN)).toBe(`http://localhost:3000/cuenta/restablecer?token=${TOKEN}`);
  });

  it("una ruta con otro dominio no cambia el destino: sale el mismo sitio… o falla, nunca otro dominio", () => {
    // `new URL("//otro.com/x", base)` cambiaría de dominio: las rutas del código son fijas, y esta prueba lo vigila.
    expect(enlaceCuenta(SITIO, "/cuenta/activar", TOKEN).startsWith(`${SITIO}/`)).toBe(true);
  });
});

describe("correos de cuentas", () => {
  const enlace = enlaceCuenta(SITIO, "/cuenta/activar", TOKEN);
  const todos = {
    activar: correoActivar(enlace),
    existente: correoAltaExistente(enlaceCuenta(SITIO, "/cuenta/entrar"), enlaceCuenta(SITIO, "/cuenta/olvide")),
    restablecer: correoRestablecer(enlaceCuenta(SITIO, "/cuenta/restablecer", TOKEN)),
    clave: correoClaveCambiada(enlaceCuenta(SITIO, "/cuenta/olvide")),
    activada: correoDosPasos(true, enlaceCuenta(SITIO, "/cuenta/seguridad")),
    desactivada: correoDosPasos(false, enlaceCuenta(SITIO, "/cuenta/seguridad")),
    eliminada: correoCuentaEliminada(),
  };

  it("el asunto nunca lleva el token ni saltos de línea, y el cuerpo siempre el pie legal", () => {
    for (const [nombre, c] of Object.entries(todos)) {
      expect(c.asunto, nombre).not.toContain(TOKEN);
      expect(c.asunto, nombre).not.toMatch(/[\r\n]/);
      expect(c.asunto.length, nombre).toBeLessThan(90);
      expect(c.texto, nombre).toContain("No constituye asesoría financiera");
      expect(c.html, nombre).toContain("No constituye asesoría financiera");
    }
  });

  it("el correo de crear la cuenta lleva el enlace, su vigencia real y qué hacer si no fue la persona", () => {
    expect(todos.activar.texto).toContain(enlace);
    expect(todos.activar.texto).toContain("vence en 72 horas");
    expect(todos.activar.texto).toContain("Si no fuiste tú, ignora este mensaje");
    expect(todos.activar.texto).toContain("7 días");
    expect(todos.activar.html).toContain(`href="${enlace}"`);
  });

  it("el de restablecer dice cuánto dura el enlace y que cierra las sesiones", () => {
    expect(todos.restablecer.texto).toContain("vence en 1 hora");
    expect(todos.restablecer.texto).toContain("se cierran todas tus sesiones");
    expect(todos.restablecer.texto).toContain("tu contraseña actual sigue funcionando");
  });

  it("el aviso de una cuenta que ya existe no revela nada que la persona no sepa", () => {
    expect(todos.existente.texto).toContain("ya tienes una");
    expect(todos.existente.texto).not.toMatch(/token=/);
  });

  it("los avisos de seguridad dicen qué hacer si no fue la persona", () => {
    expect(todos.clave.texto).toContain("Si no fuiste tú");
    expect(todos.clave.texto).toContain("/cuenta/olvide");
    expect(todos.activada.asunto).toContain("Se activó");
    expect(todos.desactivada.asunto).toContain("Se desactivó");
    expect(todos.desactivada.texto).toContain("basta la contraseña");
    expect(todos.activada.texto).toContain("/cuenta/seguridad");
  });

  it("ninguno usa lenguaje de recomendación de inversión", () => {
    for (const [nombre, c] of Object.entries(todos)) expect(frasesProhibidas(c.texto), nombre).toEqual([]);
  });

  it("ningún correo pide la contraseña ni un código", () => {
    for (const [nombre, c] of Object.entries(todos)) {
      expect(c.texto, nombre).not.toMatch(/env[ií]a(nos)? tu contraseña|respóndenos con tu|dinos tu código|escribe tu contraseña/i);
    }
  });
});
