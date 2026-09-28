/** ISNet's fixed input: a square RGB image, stretched to fit. */
export const MODEL_SIZE = 1024;

/** RGBA pixels as ISNet's 1×3×N×N input: channel-first, divided by the brightest value, less 0.5 (rembg's DIS session). */
export function toModelInput(
  rgba: ArrayLike<number>,
): Float32Array<ArrayBuffer> {
  const pixels = rgba.length / 4;
  let brightest = 1e-6;
  for (let index = 0; index < rgba.length; index += 1) {
    if (index % 4 !== 3) brightest = Math.max(brightest, rgba[index]);
  }
  return Float32Array.from({ length: pixels * 3 }, (_, index) => {
    const channel = Math.floor(index / pixels);
    const pixel = index % pixels;
    return rgba[pixel * 4 + channel] / brightest - 0.5;
  });
}

function stretchToBytes(output: ArrayLike<number>): Float32Array {
  let lowest = Infinity;
  let highest = -Infinity;
  for (let index = 0; index < output.length; index += 1) {
    lowest = Math.min(lowest, output[index]);
    highest = Math.max(highest, output[index]);
  }
  const range = highest - lowest || 1;
  return Float32Array.from(output, (value) => ((value - lowest) / range) * 255);
}

/** The model's square prediction, stretched to 0-255 and resampled bilinearly to the photo's own size. */
export function toAlphaMask(
  output: ArrayLike<number>,
  size: { width: number; height: number },
): Uint8ClampedArray {
  const source = stretchToBytes(output);
  const side = Math.round(Math.sqrt(output.length));
  const sample = (x: number, y: number) => source[y * side + x];
  // A pixel centre mapped onto the prediction's; floor() of it never passes the last row or column.
  const position = (along: number, length: number) =>
    Math.max(((along + 0.5) * side) / length - 0.5, 0);
  return Uint8ClampedArray.from(
    { length: size.width * size.height },
    (_, index) => {
      const sourceX = position(index % size.width, size.width);
      const sourceY = position(Math.floor(index / size.width), size.height);
      const left = Math.floor(sourceX);
      const right = Math.min(left + 1, side - 1);
      const top = Math.floor(sourceY);
      const bottom = Math.min(top + 1, side - 1);
      const across = sourceX - left;
      const down = sourceY - top;
      const upper =
        sample(left, top) * (1 - across) + sample(right, top) * across;
      const lower =
        sample(left, bottom) * (1 - across) + sample(right, bottom) * across;
      return upper * (1 - down) + lower * down;
    },
  );
}
