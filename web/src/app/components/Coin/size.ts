// Fluid, not fixed: a hard 420px coin touched both edges of a 390px screen.
export function coinSizeCss(size: number) {
  return `clamp(300px, 80vw, ${size}px)`;
}
