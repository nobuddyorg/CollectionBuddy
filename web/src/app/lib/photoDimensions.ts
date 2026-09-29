/** A picture's width and height, in pixels. */
export type Dimensions = { width: number; height: number };

/** Shrinks `size` until its longest side is at most `maxWidthOrHeight`, keeping its aspect ratio; never enlarges. */
export function fitWithin(
  size: Dimensions,
  maxWidthOrHeight: number,
): Dimensions {
  const scale = Math.min(
    1,
    maxWidthOrHeight / Math.max(size.width, size.height),
  );
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
