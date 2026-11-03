import { describe, expect, it } from "vitest";
import type { SecurityEvent } from "@/lib/security/log";
import { CABECERA_TAREA, exigirTarea } from "./exigir";

const SECRETO = "t".repeat(43);
const ACTIVA = {
  TAREAS_MODO: "activo" as const,
  TAREAS_SECRETO: SECRETO,
  INGESTA_CONTACTO: "mailto:ingesta@example.org",
  DATABASE_URL: "postgresql://otea_web:clave@localhost:5432/otea",
};

function solicitud(metodo = "POST", cabeceras: Record<string, string> = { [CABECERA_TAREA]: SECRETO }, cuerpo?: string) {
  return new Request("https://otea-tareas.example.org/api/tareas/ingesta", { method: metodo, headers: cabeceras, body: cuerpo });
}

function probar(request: Request, configuracion: Parameters<typeof exigirTarea>[1] = ACTIVA) {
  const eventos: SecurityEvent[] = [];
  return { pasa: exigirTarea(request, configuracion, (e) => eventos.push(e)), eventos };
}

describe("exigirTarea", () => {
  it("deja pasar un POST sin cuerpo con el secreto correcto", () => {
    expect(probar(solicitud())).toEqual({ pasa: true, eventos: [] });
  });

  it("sin el modo activo (el sitio público) no pasa nada y ni siquiera se anota", () => {
    for (const configuracion of [
      { ...ACTIVA, TAREAS_MODO: "inactivo" as const },
      { ...ACTIVA, TAREAS_SECRETO: undefined },
      { ...ACTIVA, INGESTA_CONTACTO: undefined },
      { ...ACTIVA, DATABASE_URL: undefined },
    ]) {
      expect(probar(solicitud(), configuracion)).toEqual({ pasa: false, eventos: [] });
    }
  });

  it.each([
    ["sin secreto", solicitud("POST", {})],
    ["con otro secreto", solicitud("POST", { [CABECERA_TAREA]: "u".repeat(43) })],
    ["con el secreto más largo", solicitud("POST", { [CABECERA_TAREA]: `${SECRETO}x` })],
    ["con el secreto en otro encabezado", solicitud("POST", { authorization: `Bearer ${SECRETO}` })],
    ["con GET", solicitud("GET")],
    ["con PUT", solicitud("PUT")],
    // Por HTTP, un cuerpo llega con Content-Length o Transfer-Encoding (la e2e lo prueba con el servidor real).
    ["con Content-Length mayor que 0", solicitud("POST", { [CABECERA_TAREA]: SECRETO, "content-length": "2" }, "{}")],
    ["con Transfer-Encoding", solicitud("POST", { [CABECERA_TAREA]: SECRETO, "transfer-encoding": "chunked" })],
  ])("rechaza %s y lo anota sin detalles", (_caso, request) => {
    const r = probar(request);
    expect(r.pasa).toBe(false);
    expect(r.eventos).toEqual([{ tipo: "tarea", tarea: "ingesta", resultado: "rechazada" }]);
  });

  it("anota la tarea que se rechazó (el resumen diario usa la misma puerta)", () => {
    const eventos: SecurityEvent[] = [];
    expect(exigirTarea(solicitud("GET"), ACTIVA, (e) => eventos.push(e), "resumen")).toBe(false);
    expect(eventos).toEqual([{ tipo: "tarea", tarea: "resumen", resultado: "rechazada" }]);
    expect(exigirTarea(solicitud(), ACTIVA, (e) => eventos.push(e), "resumen")).toBe(true);
  });
});
