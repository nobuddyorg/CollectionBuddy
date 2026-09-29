// Capped at 80vw so the coin never touches a phone's edges.
export function coinSizeCss(size: number) {
  return `clamp(300px, 80vw, ${size}px)`;
}
