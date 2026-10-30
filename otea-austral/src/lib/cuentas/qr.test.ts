import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { crearQr, QrDemasiadoLargo, rutaSvgQr, VERSION_MAXIMA } from "./qr";

/** Bytes que caben en cada versión con corrección de errores M (tabla de la especificación, modo de bytes). */
const CAPACIDAD_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];

const dibujo = (modulos: boolean[][]) => modulos.map((fila) => fila.map((m) => (m ? "#" : ".")).join("")).join("\n");

describe("código QR", () => {
  describe("versión según el largo", () => {
    it("usa la versión más chica en la que cabe el texto, hasta la 20", () => {
      expect(VERSION_MAXIMA).toBe(20);
      CAPACIDAD_M.forEach((capacidad, i) => {
        const version = i + 1;
        expect(crearQr("x".repeat(capacidad)).version, `${capacidad} bytes`).toBe(version);
        if (version < VERSION_MAXIMA) expect(crearQr("x".repeat(capacidad + 1)).version, `${capacidad + 1} bytes`).toBe(version + 1);
      });
    });

    it("lo que no cabe en la versión 20 lanza un error claro", () => {
      expect(() => crearQr("x".repeat(667))).toThrow(QrDemasiadoLargo);
      expect(() => crearQr("x".repeat(5000))).toThrow(/versión 20/);
    });

    it("cuenta bytes UTF-8, no caracteres", () => {
      expect(crearQr("ñ".repeat(7)).version).toBe(1); // 14 bytes
      expect(crearQr("ñ".repeat(8)).version).toBe(2); // 16 bytes
      expect(crearQr("😀".repeat(3)).version).toBe(1); // 12 bytes
    });

    it("el lado es 17 + 4 · versión", () => {
      for (const n of [1, 20, 100, 300, 666]) {
        const qr = crearQr("a".repeat(n));
        expect(qr.tamano).toBe(17 + 4 * qr.version);
        expect(qr.modulos).toHaveLength(qr.tamano);
        for (const fila of qr.modulos) expect(fila).toHaveLength(qr.tamano);
      }
    });
  });

  describe("estructura", () => {
    const qr = crearQr("otpauth://totp/Otea%20Austral:ana%40correo.cl?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Otea%20Austral");
    const { modulos, tamano } = qr;

    it("tiene los tres buscadores de 7×7 en las esquinas y ninguno en la cuarta", () => {
      const buscador = (x0: number, y0: number) => {
        for (let dy = 0; dy < 7; dy++) {
          for (let dx = 0; dx < 7; dx++) {
            const borde = dx === 0 || dx === 6 || dy === 0 || dy === 6;
            const centro = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
            expect(modulos[y0 + dy][x0 + dx], `(${x0 + dx}, ${y0 + dy})`).toBe(borde || centro);
          }
        }
      };
      buscador(0, 0);
      buscador(tamano - 7, 0);
      buscador(0, tamano - 7);
    });

    it("deja una franja clara alrededor de cada buscador", () => {
      for (let i = 0; i < 8; i++) {
        expect(modulos[7][i]).toBe(false);
        expect(modulos[i][7]).toBe(false);
        expect(modulos[7][tamano - 1 - i]).toBe(false);
        expect(modulos[i][tamano - 8]).toBe(false);
        expect(modulos[tamano - 8][i]).toBe(false);
        expect(modulos[tamano - 1 - i][7]).toBe(false);
      }
    });

    it("alterna oscuro y claro en las líneas de sincronía y siempre tiene su módulo oscuro fijo", () => {
      for (let i = 8; i < tamano - 8; i++) {
        expect(modulos[6][i]).toBe(i % 2 === 0);
        expect(modulos[i][6]).toBe(i % 2 === 0);
      }
      expect(modulos[tamano - 8][8]).toBe(true);
    });

    it("es determinista", () => {
      expect(dibujo(crearQr("hola").modulos)).toBe(dibujo(crearQr("hola").modulos));
      expect(dibujo(crearQr("hola").modulos)).not.toBe(dibujo(crearQr("hole").modulos));
    });

    it("cada máscara da un dibujo distinto con los mismos patrones fijos", () => {
      const dibujos = Array.from({ length: 8 }, (_, mascara) => crearQr("hola", { mascara }));
      expect(new Set(dibujos.map((d) => dibujo(d.modulos))).size).toBe(8);
      dibujos.forEach((d, i) => expect(d.mascara).toBe(i));
      for (const d of dibujos) expect(d.modulos[0].slice(0, 7)).toEqual(Array(7).fill(true));
    });
  });

  describe("casos fijos (se leyeron con un decodificador independiente antes de fijarlos)", () => {
    it("«HELLO» (versión 1, nivel M)", () => {
      const qr = crearQr("HELLO");
      expect([qr.version, qr.mascara]).toEqual([1, 4]);
      expect(dibujo(qr.modulos)).toBe(
        [
          "#######.##.#..#######",
          "#.....#..##.#.#.....#",
          "#.###.#..####.#.###.#",
          "#.###.#.#..#..#.###.#",
          "#.###.#.#...#.#.###.#",
          "#.....#.#.##..#.....#",
          "#######.#.#.#.#######",
          "........#####........",
          "#...#.######.#####..#",
          "...###..#.###..#.####",
          "#.##..#.#.##..###..#.",
          "###..#...#...##.#....",
          "..#.###..#..###...##.",
          "........###.###..#.##",
          "#######.##..##...#.#.",
          "#.....#....##..#...#.",
          "#.###.#.#..#..###.#.#",
          "#.###.#....##....#.##",
          "#.###.#..###..####...",
          "#.....#..#...##......",
          "#######.#...#####.#.#",
        ].join("\n"),
      );
    });

    it("el enlace de una app de autenticación (versión 7)", () => {
      const qr = crearQr(
        "otpauth://totp/Otea%20Austral:ana%40correo.cl?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Otea%20Austral",
      );
      expect([qr.version, qr.mascara, qr.tamano]).toEqual([7, 4, 45]);
      const huella = createHash("sha256")
        .update(qr.modulos.map((f) => f.map((m) => (m ? "1" : "0")).join("")).join("\n"))
        .digest("hex");
      expect(huella).toBe("cf4772401e8e73d197a6f306e1d6797a7b07c3f8e376fa12eca02eaed26266c6");
    });
  });

  describe("dibujo SVG", () => {
    /** Reconstruye la cuadrícula a partir del trazo, para compararla con la original. */
    function leerRuta(ruta: string, lado: number, zona: number): boolean[][] {
      const rejilla = Array.from({ length: lado - zona * 2 }, () => new Array<boolean>(lado - zona * 2).fill(false));
      for (const m of ruta.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
        const [x, y, ancho] = [Number(m[1]) - zona, Number(m[2]) - zona, Number(m[3])];
        expect(m[4]).toBe(m[3]);
        for (let i = 0; i < ancho; i++) rejilla[y][x + i] = true;
      }
      return rejilla;
    }

    it("el trazo reproduce exactamente los módulos oscuros, con zona de silencio de 4", () => {
      const qr = crearQr("https://oteaustral.com/cuenta");
      const { ruta, lado } = rutaSvgQr(qr);
      expect(lado).toBe(qr.tamano + 8);
      expect(ruta).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
      expect(dibujo(leerRuta(ruta, lado, 4))).toBe(dibujo(qr.modulos));
    });

    it("admite otra zona de silencio", () => {
      const qr = crearQr("hola");
      const { ruta, lado } = rutaSvgQr(qr, 2);
      expect(lado).toBe(qr.tamano + 4);
      expect(dibujo(leerRuta(ruta, lado, 2))).toBe(dibujo(qr.modulos));
    });

    it("solo usa órdenes de trazo y números: nada que un SVG pudiera interpretar como código", () => {
      const { ruta } = rutaSvgQr(crearQr("<script>alert(1)</script>"));
      expect(ruta).toMatch(/^[MhvzHV0-9 .-]+$/);
    });
  });
});
