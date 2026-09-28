/** Centre and semi-axes in pixels; `angle` turns the x semi-axis, in radians. */
export type Ellipse = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  angle: number;
};

export type MaskAnalysis = {
  /** 1 on the object, 0 on the background: every blob that is not a speck, holes filled unless they show the background. */
  mask: Uint8Array;
  ellipse: Ellipse;
  /** Intersection over union of `mask` and the filled `ellipse`: 1 for a perfect ellipse. */
  fillRatio: number;
};

/** Where a model's 0-255 alpha starts to count as the object. */
const FOREGROUND_ALPHA = 128;

/** The one threshold the whole cut-out judges alpha by. */
export function isOpaque(alpha: number): boolean {
  return alpha >= FOREGROUND_ALPHA;
}

// A blob under this share of the largest is the model's residue, not another object.
const MIN_OBJECT_SHARE = 0.05;
// An enclosed hole up to this share of the object is always a miss, a highlight say, whatever its colour.
const MAX_FILLED_HOLE_SHARE = 0.05;
// A larger hole stays open only if its mean colour is this close (RGB distance) to the background's: a ring's centre, not a stamp's picture.
const BACKGROUND_COLOUR_DISTANCE = 48;

/** The objects in a model's alpha mask over the photo's RGBA `pixels`, cleaned up, with the ellipse their moments describe. */
export function analyzeMask({
  alpha,
  pixels,
  width,
  height,
}: {
  alpha: ArrayLike<number>;
  pixels: ArrayLike<number>;
  width: number;
  height: number;
}): MaskAnalysis | null {
  const objects = significantBlobs(alpha, width);
  if (objects === null) return null;
  const mask = fillHoles({ objects, pixels, width, height });
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

// Iterative: recursion would overflow the call stack on a 2000px object.
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

function significantBlobs(alpha: ArrayLike<number>, width: number) {
  const labels = new Int32Array(alpha.length);
  const include = (index: number) => isOpaque(alpha[index]);
  // Each blob is labelled after its first pixel, index + 1, so 0 stays free for "not yet reached".
  const sizes = new Int32Array(alpha.length + 1);
  labels.forEach((_, index) => {
    const label = index + 1;
    sizes[label] = floodFill({
      seeds: [index],
      include,
      marks: labels,
      label,
      width,
    });
  });
  const largest = sizes.reduce((most, size) => Math.max(most, size), 0);
  if (largest === 0) return null;
  const smallest = largest * MIN_OBJECT_SHARE;
  return Uint8Array.from(labels, (label) => (sizes[label] >= smallest ? 1 : 0));
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

type Colour = [red: number, green: number, blue: number];

/** Each region's mean colour, keyed by its label; -1 is the background the border reaches. */
function meanColours(regions: Int32Array, pixels: ArrayLike<number>) {
  const sums = new Map<number, [...Colour, number]>();
  regions.forEach((region, index) => {
    const sum = sums.get(region) ?? [0, 0, 0, 0];
    sum[0] += pixels[index * 4];
    sum[1] += pixels[index * 4 + 1];
    sum[2] += pixels[index * 4 + 2];
    sum[3] += 1;
    sums.set(region, sum);
  });
  const means = new Map<number, Colour>();
  sums.forEach(([red, green, blue, count], region) =>
    means.set(region, [red / count, green / count, blue / count]),
  );
  return means;
}

/** Background is whatever the image border reaches; an enclosed hole is filled if it is small or does not look like that background. */
function fillHoles({
  objects,
  pixels,
  width,
  height,
}: {
  objects: Uint8Array;
  pixels: ArrayLike<number>;
  width: number;
  height: number;
}) {
  const regions = new Int32Array(objects.length);
  const isBackground = (index: number) => objects[index] === 0;
  floodFill({
    seeds: borderIndices(width, height),
    include: isBackground,
    marks: regions,
    label: -1,
    width,
  });
  // Infinity for the object's own region 0, which is no hole and never small.
  const holeSizes = new Float64Array(objects.length + 1).fill(Infinity);
  regions.forEach((_, index) => {
    const label = index + 1;
    holeSizes[label] = floodFill({
      seeds: [index],
      include: isBackground,
      marks: regions,
      label,
      width,
    });
  });
  const colours = meanColours(regions, pixels);
  // No background at all when the object fills the frame's whole border: then no hole can look like it.
  const background = colours.get(-1) ?? [Infinity, Infinity, Infinity];
  const area = objects.reduce((sum, inside) => sum + inside, 0);
  const filled = new Map<number, boolean>();
  colours.forEach((colour, region) => {
    const small = holeSizes[region] <= area * MAX_FILLED_HOLE_SHARE;
    const distance = Math.hypot(
      ...colour.map((value, channel) => value - background[channel]),
    );
    filled.set(region, small || distance > BACKGROUND_COLOUR_DISTANCE);
  });
  return Uint8Array.from(regions, (region, index) =>
    objects[index] === 1 || filled.get(region) === true ? 1 : 0,
  );
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
