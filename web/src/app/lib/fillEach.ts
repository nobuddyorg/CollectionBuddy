/** Sets each element of `target` to `valueAt(index)` and returns it: a typed array's mapped `from` runs the iterator protocol, several times slower in V8. */
export function fillEach<Target extends Uint8Array | Uint8ClampedArray>(
  target: Target,
  valueAt: (index: number) => number,
): Target {
  target.forEach((_, index) => {
    target[index] = valueAt(index);
  });
  return target;
}
