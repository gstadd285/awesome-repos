import { describe, expect, it } from "vitest";
import {
  AlertAuditSchema,
  AlertSchema,
  AlertSourceSchema,
  SourceSchema,
  type Alert,
  type AlertSource,
} from "./schemas";

const enlace: AlertSource = {
  alert_id: "a1",
  source_id: "s1",
  titulo_documento: "Comunicado",
  url: "https://example.org/doc",
  fecha_publicacion: "2026-10-01",
  fecha_consulta: "2026-10-02",
};

const alerta: Alert = {
  id: "a1",
  tema: "cobre",
  evento: "Evento",
  resumen: "Resumen propio",
  filas: [{ sector: "Minería", direccion: "gana", condicion: "Si sube el precio", confianza: "media" }],
  fecha: "2026-10-08T10:00:00-03:00",
  revisor: "Equipo",
  impacto: "medio",
  estado: "borrador",
  es_ejemplo: true,
};

describe("AlertSourceSchema", () => {
  it("acepta un enlace válido", () => {
    expect(AlertSourceSchema.safeParse(enlace).success).toBe(true);
  });

  it("rechaza enlaces que no son https", () => {
    for (const url of ["http://example.org/", "javascript:alert(1)", "data:text/plain,hola"]) {
      expect(AlertSourceSchema.safeParse({ ...enlace, url }).success).toBe(false);
    }
  });

  it.each(["2026-02-30", "2026-13-01", "ayer", "01-10-2026", "2026-10-1"])(
    "rechaza la fecha inválida %s",
    (fecha) => {
      expect(AlertSourceSchema.safeParse({ ...enlace, fecha_publicacion: fecha }).success).toBe(false);
    },
  );

  it("acepta el 29 de febrero solo en años bisiestos", () => {
    const bisiesto = { ...enlace, fecha_publicacion: "2028-02-29", fecha_consulta: "2028-03-01" };
    const comun = { ...enlace, fecha_publicacion: "2027-02-29", fecha_consulta: "2027-03-01" };
    expect(AlertSourceSchema.safeParse(bisiesto).success).toBe(true);
    expect(AlertSourceSchema.safeParse(comun).success).toBe(false);
  });

  it("rechaza una consulta anterior a la publicación", () => {
    const r = AlertSourceSchema.safeParse({ ...enlace, fecha_consulta: "2026-09-30" });
    expect(r.success).toBe(false);
  });

  it("no admite campos extra (como el texto copiado de la fuente)", () => {
    expect(AlertSourceSchema.safeParse({ ...enlace, texto: "copiado" }).success).toBe(false);
  });
});

describe("AlertSchema", () => {
  it("acepta una alerta válida", () => {
    expect(AlertSchema.safeParse(alerta).success).toBe(true);
  });

  it("rechaza confianza o verificación escritas a mano (regla 6)", () => {
    expect(AlertSchema.safeParse({ ...alerta, confianza: "alta" }).success).toBe(false);
    expect(AlertSchema.safeParse({ ...alerta, nivel_verificacion: "fuente_oficial" }).success).toBe(
      false,
    );
  });

  it("rechaza una fecha sin zona horaria", () => {
    expect(AlertSchema.safeParse({ ...alerta, fecha: "2026-10-08 10:00" }).success).toBe(false);
  });

  it("exige al menos una fila", () => {
    expect(AlertSchema.safeParse({ ...alerta, filas: [] }).success).toBe(false);
  });
});

describe("SourceSchema", () => {
  const fuente = {
    id: "bcch",
    nombre: "Comunicados",
    organismo: "Banco Central de Chile",
    url_base: "",
    tipo: "primaria",
    temas: ["divisas"],
    acceso: "manual",
    condiciones_reutilizacion: "pendiente de verificar",
    prioridad: "A",
    activa: true,
  };

  it("permite dejar vacía una URL no verificada", () => {
    expect(SourceSchema.safeParse(fuente).success).toBe(true);
  });

  it("rechaza una URL base que no sea https", () => {
    expect(SourceSchema.safeParse({ ...fuente, url_base: "http://example.org" }).success).toBe(false);
  });
});

describe("AlertAuditSchema", () => {
  const fila = {
    id: "au1",
    alert_id: "a1",
    accion: "creada",
    actor: "editor.hm",
    fecha: "2026-10-08T10:00:00Z",
    nota: "",
  };

  it("acepta un alias interno como actor", () => {
    expect(AlertAuditSchema.safeParse(fila).success).toBe(true);
  });

  it("rechaza correos u otros datos personales como actor", () => {
    expect(AlertAuditSchema.safeParse({ ...fila, actor: "persona@correo.cl" }).success).toBe(false);
    expect(AlertAuditSchema.safeParse({ ...fila, actor: "Nombre Apellido" }).success).toBe(false);
  });
});
