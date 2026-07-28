// Shared visual language for the "cabinet of curiosities" redesign: a small
// deterministic hash turns a stable id (category name, item id) into a pin
// color and a hand-set rotation, so the same entity always looks the same
// way but the collection as a whole doesn't read as a uniform grid.

const INK_VARS = [
  '--color-ink-rust',
  '--color-ink-moss',
  '--color-ink-cobalt',
  '--color-ink-plum',
  '--color-ink-brass',
] as const;

export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function inkVarFor(seed: string): string {
  const v = INK_VARS[hashString(seed) % INK_VARS.length];
  return `var(${v})`;
}

// Small, deliberately subtle hand-set tilt -- never enough to make two
// neighboring cards visually collide.
export function rotationDegFor(seed: string, maxDeg = 1.4): number {
  const h = hashString(seed);
  const sign = h % 2 === 0 ? 1 : -1;
  const minDeg = 0.4;
  const magnitude = minDeg + ((h >> 3) % 100) * ((maxDeg - minDeg) / 100);
  return sign * magnitude;
}
