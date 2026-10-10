import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "./rate-limit";

function reloj(inicio = 0) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

describe("createFixedWindowLimiter", () => {
  it("permite hasta el límite dentro de la ventana", () => {
    const r = reloj();
    const limiter = createFixedWindowLimiter({ limite: 3, ventanaMs: 1000, ahora: r.ahora });
    expect([1, 2, 3, 4].map(() => limiter.tryConsume())).toEqual([true, true, true, false]);
  });

  it("reinicia el cupo al cambiar de ventana", () => {
    const r = reloj();
    const limiter = createFixedWindowLimiter({ limite: 1, ventanaMs: 1000, ahora: r.ahora });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
    r.avanzar(1000);
    expect(limiter.tryConsume()).toBe(true);
  });

  it("cuenta cada clave por separado", () => {
    const limiter = createFixedWindowLimiter({ limite: 1, ventanaMs: 1000, ahora: reloj().ahora });
    expect(limiter.tryConsume("a")).toBe(true);
    expect(limiter.tryConsume("b")).toBe(true);
    expect(limiter.tryConsume("a")).toBe(false);
  });

  it("no crece sin límite: rechaza claves nuevas si la memoria está llena", () => {
    const r = reloj();
    const limiter = createFixedWindowLimiter({
      limite: 5,
      ventanaMs: 1000,
      maxClaves: 2,
      ahora: r.ahora,
    });
    expect(limiter.tryConsume("a")).toBe(true);
    expect(limiter.tryConsume("b")).toBe(true);
    expect(limiter.tryConsume("c")).toBe(false);
    r.avanzar(1000);
    // Las ventanas vencidas se liberan.
    expect(limiter.tryConsume("c")).toBe(true);
  });
});
