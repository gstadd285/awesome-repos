import { describe, expect, it } from "vitest";
import {
  atributosIndebidos,
  generarClave,
  NOMBRE_ROL,
  sentenciasRol,
  urlAplicacion,
  validarClave,
  verificadorScram,
} from "../../../scripts/lib/rol-app.mjs";

describe("usuario de la aplicación (scripts/lib/rol-app.mjs)", () => {
  it("las claves generadas son largas, mezclan tipos de carácter y cumplen la validación", () => {
    for (let i = 0; i < 20; i++) {
      const clave = generarClave();
      expect(clave.length).toBeGreaterThanOrEqual(32);
      expect(clave).toMatch(/[a-z]/);
      expect(clave).toMatch(/[A-Z]/);
      expect(clave).toMatch(/\d/);
      expect(validarClave(clave)).toBe(clave);
    }
    expect(generarClave()).not.toBe(generarClave());
  });

  it("rechaza claves cortas o con caracteres que podrían romper una sentencia", () => {
    for (const mala of ["", "corta", "x".repeat(15), "x".repeat(129), "con espacios aaaaaaaaaa", "comilla'aaaaaaaaaaaaaaa", "punto;coma;aaaaaaaaaa"]) {
      expect(() => validarClave(mala), mala).toThrow();
    }
  });

  it("solo acepta nombres de rol seguros (se usan como identificador SQL)", () => {
    expect(NOMBRE_ROL.test("otea_web")).toBe(true);
    for (const malo of ["", "Otea", "1abc", "a-b", "ab", 'a"; drop table x; --', "x".repeat(42)]) {
      expect(NOMBRE_ROL.test(malo), malo).toBe(false);
      expect(() => sentenciasRol(malo, "secreto", false), malo).toThrow();
    }
  });

  it("el verificador SCRAM tiene el formato de Postgres y no contiene la clave", () => {
    const clave = generarClave();
    const v = verificadorScram(clave);
    expect(v).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(v).not.toContain(clave);
    expect(verificadorScram(clave)).not.toBe(v); // sal distinta cada vez
  });

  it("crea o renueva el usuario como miembro de otea_app, con límites de tiempo y de conexiones", () => {
    const nuevo = sentenciasRol("otea_web", "SCRAM-x'y", false);
    expect(nuevo[0]).toBe("create role otea_web with login password 'SCRAM-x''y'");
    expect(sentenciasRol("otea_web", "x", true)[0]).toMatch(/^alter role otea_web with login password/);
    expect(nuevo).toContain("grant otea_app to otea_web");
    expect(nuevo.join(";")).toMatch(/connection limit 20[\s\S]*statement_timeout = '5s'[\s\S]*idle_in_transaction_session_timeout/);
  });

  it("la URL de la aplicación cambia usuario y clave, pide TLS fuera de local y usa el agrupador de Neon", () => {
    expect(urlAplicacion("postgresql://dueno:x@localhost:5432/otea", "otea_web", "clave123")).toBe(
      "postgresql://otea_web:clave123@localhost:5432/otea",
    );
    const neon = new URL(urlAplicacion("postgresql://dueno:x@ep-azul-123.us-east-2.aws.neon.tech/neondb", "otea_web", "k"));
    expect(neon.hostname).toBe("ep-azul-123-pooler.us-east-2.aws.neon.tech");
    expect(neon.searchParams.get("sslmode")).toBe("verify-full");
    expect(neon.username).toBe("otea_web");
    // Si ya usa el agrupador, no se duplica.
    expect(new URL(urlAplicacion("postgresql://d:x@ep-azul-123-pooler.us-east-2.aws.neon.tech/neondb", "o", "k")).hostname).toBe(
      "ep-azul-123-pooler.us-east-2.aws.neon.tech",
    );
  });

  describe("atributos que la aplicación no debe tener", () => {
    const sano = { rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolinherit: true };

    it("un usuario sano no tiene nada que corregir", () => {
      expect(atributosIndebidos(sano)).toEqual([]);
    });

    it("señala cada atributo de más, incluido saltarse RLS", () => {
      expect(atributosIndebidos({ ...sano, rolsuper: true })).toEqual(["superusuario"]);
      expect(atributosIndebidos({ ...sano, rolbypassrls: true })[0]).toContain("BYPASSRLS");
      expect(atributosIndebidos({ ...sano, rolcreatedb: true, rolcreaterole: true, rolreplication: true })).toHaveLength(3);
      expect(atributosIndebidos({ ...sano, rolinherit: false })[0]).toContain("sin herencia");
    });
  });
});
