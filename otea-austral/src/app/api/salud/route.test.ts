import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("sonda de vida /api/salud", () => {
  it("responde 200 con un cuerpo mínimo y sin caché", async () => {
    const r = GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ estado: "ok" });
  });

  it("HEAD responde 200 sin cuerpo", async () => {
    const r = HEAD();
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
  });
});
