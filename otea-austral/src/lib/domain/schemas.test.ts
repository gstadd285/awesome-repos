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

  describe("feeds", () => {
    const conBase = { ...fuente, url_base: "https://www.bcentral.cl/" };
    const feed = {
      url: "https://www.bcentral.cl/rss/comunicados.xml",
      formato: "rss",
      titulo: "Comunicados",
      verificado: "2026-10-25",
    } as const;
    const motivos = (valor: unknown) => {
      const r = SourceSchema.safeParse(valor);
      return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    };

    it("sin feeds, el acceso manual es válido y la lista queda vacía", () => {
      const r = SourceSchema.safeParse(conBase);
      expect(r.success && r.data.feeds).toEqual([]);
    });

    it("acepta acceso rss con un feed RSS o Atom verificado en el dominio (o un subdominio)", () => {
      expect(motivos({ ...conBase, acceso: "rss", feeds: [feed] })).toEqual([]);
      expect(motivos({ ...conBase, acceso: "rss", feeds: [{ ...feed, formato: "atom" }] })).toEqual([]);
      const api = { ...feed, url: "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx", formato: "api" };
      expect(motivos({ ...conBase, acceso: "api", feeds: [api] })).toEqual([]);
    });

    it("rss o api sin el feed que lo respalde se rechaza", () => {
      expect(motivos({ ...conBase, acceso: "rss" })).toEqual(["acceso: El acceso rss exige al menos un feed RSS o Atom verificado."]);
      expect(motivos({ ...conBase, acceso: "api", feeds: [feed] })[0]).toMatch(/^acceso: El acceso api exige/);
    });

    it("una fuente manual no lleva feeds (se cambia el acceso al verificar)", () => {
      expect(motivos({ ...conBase, feeds: [feed] })[0]).toMatch(/^feeds: Una fuente de acceso manual/);
    });

    it("exige la fecha de verificación y rechaza campos de más", () => {
      const sinFecha = { url: feed.url, formato: feed.formato, titulo: feed.titulo };
      expect(motivos({ ...conBase, acceso: "rss", feeds: [sinFecha] }).length).toBeGreaterThan(0);
      expect(motivos({ ...conBase, acceso: "rss", feeds: [{ ...feed, verificado: "25-10-2026" }] }).length).toBeGreaterThan(0);
      expect(motivos({ ...conBase, acceso: "rss", feeds: [{ ...feed, texto: "copiado" }] }).length).toBeGreaterThan(0);
    });

    it.each([
      ["otro dominio", "https://example.org/rss.xml"],
      ["sufijo engañoso", "https://bcentral.cl.example.org/rss.xml"],
    ])("rechaza un feed fuera del dominio de la fuente (%s)", (_, url) => {
      expect(motivos({ ...conBase, acceso: "rss", feeds: [{ ...feed, url }] })).toEqual([
        "feeds.0.url: El feed debe estar en el dominio de url_base (o en un subdominio suyo).",
      ]);
    });

    it("rechaza un feed http y un feed sin url_base verificada", () => {
      expect(motivos({ ...conBase, acceso: "rss", feeds: [{ ...feed, url: "http://www.bcentral.cl/rss.xml" }] }).length).toBeGreaterThan(0);
      expect(motivos({ ...fuente, acceso: "rss", feeds: [feed] })).toEqual([
        "feeds.0.url: El feed debe estar en el dominio de url_base (o en un subdominio suyo).",
      ]);
    });

    it.each(["api_key", "apikey", "API-KEY", "token", "user", "pass"])("rechaza credenciales en la URL (%s)", (param) => {
      const url = `https://api.bcentral.cl/datos?serie=F073&${param}=abc123`;
      expect(motivos({ ...conBase, acceso: "api", feeds: [{ ...feed, url, formato: "api" }] })).toEqual([
        "feeds.0.url: La URL de un feed no lleva credenciales: van en el entorno, nunca en el registro.",
      ]);
    });

    it("rechaza un feed repetido", () => {
      expect(motivos({ ...conBase, acceso: "rss", feeds: [feed, feed] })).toEqual(["feeds.1.url: Feed repetido."]);
    });
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
