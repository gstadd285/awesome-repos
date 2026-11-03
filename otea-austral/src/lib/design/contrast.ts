/** Contraste WCAG 2.x entre dos colores `#rrggbb`. */
export function contrastRatio(foreground: string, background: string): number {
  const [a, b] = [relativeLuminance(foreground), relativeLuminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Color resultante de pintar `foreground` con opacidad `alpha` sobre `background`. */
export function blend(foreground: string, background: string, alpha: number): string {
  const f = channels(foreground);
  const b = channels(background);
  return `#${f
    .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Color inválido: ${hex}`);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
