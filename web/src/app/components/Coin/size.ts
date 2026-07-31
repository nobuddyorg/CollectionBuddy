// The medallion's diameter as a CSS length. Fluid rather than fixed: on a
// 390px screen a hard 420px coin touched both edges.
//
// It lives here rather than inline in the component because the login page
// arranges things *around* the coin, and "around" is only meaningful if
// both sides measure it the same way.
export function coinSizeCss(size: number) {
  return `clamp(300px, 80vw, ${size}px)`;
}
