/** Centre and semi-axes in pixels; `angle` turns the x semi-axis, in radians. */
export type Ellipse = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  angle: number;
};

export type MaskAnalysis = {
  /** 1 inside the coin, 0 outside: the largest blob with its holes filled. */
  mask: Uint8Array;
  ellipse: Ellipse;
  /** Intersection over union of `mask` and the filled `ellipse`: 1 for a perfect ellipse. */
  fillRatio: number;
};

/** Where a model's 0-255 alpha starts to count as the object. */
export const FOREGROUND_ALPHA = 128;

/** The one threshold the whole cut-out judges alpha by. */
export function isOpaque(alpha: number): boolean {
  return alpha >= FOREGROUND_ALPHA;
}

/** The coin in a model's alpha mask: its largest blob, holes filled, with the ellipse its moments describe. */
export function analyzeMask(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
): MaskAnalysis | null {
  const blob = largestBlob(alpha, width);
  if (blob === null) return null;
  const mask = fillHoles(blob, width, height);
  const ellipse = fitEllipse(mask, width);
  const ellipseInside = Uint8Array.from(
    ellipseCoverage(ellipse, width, height),
    (value) => (isOpaque(value) ? 1 : 0),
  );
  return { mask, ellipse, fillRatio: overlap(mask, ellipseInside) };
}

/** The up-to-four pixels sharing an edge with `index`, never wrapping from one row's end to the next's start. */
export function edgeNeighbours(
  index: number,
  width: number,
  pixels: number,
): number[] {
  const x = index % width;
  const neighbours: number[] = [];
  if (x > 0) neighbours.push(index - 1);
  if (x < width - 1) neighbours.push(index + 1);
  if (index >= width) neighbours.push(index - width);
  if (index + width < pixels) neighbours.push(index + width);
  return neighbours;
}

// Iterative: recursion would overflow the call stack on a 2000px coin.
function floodFill({
  seeds,
  include,
  marks,
  label,
  width,
}: {
  seeds: number[];
  include: (index: number) => boolean;
  marks: Int32Array;
  label: number;
  width: number;
}): number {
  const stack: number[] = [];
  const visit = (index: number) => {
    if (marks[index] !== 0 || !include(index)) return;
    marks[index] = label;
    stack.push(index);
  };
  seeds.forEach(visit);
  let count = 0;
  while (stack.length > 0) {
    count += 1;
    edgeNeighbours(stack.pop()!, width, marks.length).forEach(visit);
  }
  return count;
}

function largestBlob(alpha: ArrayLike<number>, width: number) {
  const labels = new Int32Array(alpha.length);
  const include = (index: number) => isOpaque(alpha[index]);
  let largest = { label: 0, count: 0 };
  // Each blob is labelled after its first pixel, index + 1, so 0 stays free for "not yet reached".
  labels.forEach((_, index) => {
    const label = index + 1;
    const count = floodFill({
      seeds: [index],
      include,
      marks: labels,
      label,
      width,
    });
    if (count > largest.count) largest = { label, count };
  });
  if (largest.label === 0) return null;
  return Uint8Array.from(labels, (value) => (value === largest.label ? 1 : 0));
}

function borderIndices(width: number, height: number): number[] {
  const rows = Array.from({ length: width }, (_, x) => [
    x,
    (height - 1) * width + x,
  ]);
  const columns = Array.from({ length: height }, (_, y) => [
    y * width,
    y * width + width - 1,
  ]);
  return [...rows, ...columns].flat();
}

/** Background is whatever the image border reaches; everything else belongs to the blob. */
function fillHoles(blob: Uint8Array, width: number, height: number) {
  const outside = new Int32Array(blob.length);
  floodFill({
    seeds: borderIndices(width, height),
    include: (index) => blob[index] === 0,
    marks: outside,
    label: 1,
    width,
  });
  return Uint8Array.from(outside, (value) => 1 - value);
}

/** A uniform filled ellipse has variance r²/4 along each axis, so each radius is twice a standard deviation. */
function fitEllipse(mask: Uint8Array, width: number): Ellipse {
  const sums = { count: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 };
  mask.forEach((inside, index) => {
    if (!inside) return;
    const x = index % width;
    const y = Math.floor(index / width);
    sums.count += 1;
    sums.x += x;
    sums.y += y;
    sums.xx += x * x;
    sums.yy += y * y;
    sums.xy += x * y;
  });
  const meanX = sums.x / sums.count;
  const meanY = sums.y / sums.count;
  const xx = sums.xx / sums.count - meanX ** 2;
  const yy = sums.yy / sums.count - meanY ** 2;
  const xy = sums.xy / sums.count - meanX * meanY;
  const mean = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  return {
    // Pixel centres, as ellipseCoverage measures them.
    centerX: meanX + 0.5,
    centerY: meanY + 0.5,
    radiusX: 2 * Math.sqrt(mean + spread),
    radiusY: 2 * Math.sqrt(Math.max(mean - spread, 0)),
    angle: Math.atan2(2 * xy, xx - yy) / 2,
  };
}

/** 0-255 per pixel, with a one-pixel soft edge so the cut-out's rim is not jagged; the array clamps and rounds. */
export function ellipseCoverage(
  ellipse: Ellipse,
  width: number,
  height: number,
): Uint8ClampedArray {
  const cos = Math.cos(ellipse.angle);
  const sin = Math.sin(ellipse.angle);
  const edgeScale = Math.sqrt(ellipse.radiusX * ellipse.radiusY);
  return Uint8ClampedArray.from({ length: width * height }, (_, index) => {
    const dx = (index % width) + 0.5 - ellipse.centerX;
    const dy = Math.floor(index / width) + 0.5 - ellipse.centerY;
    const along = (dx * cos + dy * sin) / ellipse.radiusX;
    const across = (dy * cos - dx * sin) / ellipse.radiusY;
    return 255 * ((1 - Math.hypot(along, across)) * edgeScale + 0.5);
  });
}

function overlap(first: Uint8Array, second: Uint8Array): number {
  let both = 0;
  let either = 0;
  first.forEach((value, index) => {
    both += value & second[index];
    either += value | second[index];
  });
  return both / either;
}
