// Fluid rather than fixed: on a 390px screen a hard 420px coin touched both
// edges. Lives here (not inline) so the login page, which arranges itself
// around the coin, computes the same size.
export function coinSizeCss(size: number) {
  return `clamp(300px, 80vw, ${size}px)`;
}
