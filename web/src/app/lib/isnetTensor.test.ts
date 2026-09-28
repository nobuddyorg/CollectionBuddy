import { describe, expect, it } from 'vitest';

import { MODEL_SIZE, toAlphaMask, toModelInput } from './isnetTensor';

describe('toModelInput', () => {
  it('lays pixels out channel-first: every red, then every green, then every blue', () => {
    const rgba = [200, 100, 50, 255, 0, 20, 40, 255];

    const input = toModelInput(rgba);

    expect(Array.from(input)).toEqual(
      [200, 0, 100, 20, 50, 40].map((value) => Math.fround(value / 200 - 0.5)),
    );
  });

  it('divides by the brightest colour value, never by the alpha channel', () => {
    const input = toModelInput([100, 50, 0, 255]);

    expect(Array.from(input)).toEqual([0.5, 0, -0.5]);
  });

  it('turns an all-black photo into -0.5 everywhere instead of dividing by zero', () => {
    expect(Array.from(toModelInput([0, 0, 0, 255]))).toEqual([
      -0.5, -0.5, -0.5,
    ]);
  });

  it("matches ISNet's square input size", () => {
    expect(MODEL_SIZE).toBe(1024);
  });
});

describe('toAlphaMask', () => {
  it('stretches the prediction so its lowest value is 0 and its highest 255', () => {
    const alpha = toAlphaMask([-2, 0, 2, 6], { width: 2, height: 2 });

    expect(Array.from(alpha)).toEqual([0, 64, 128, 255]);
  });

  it('is fully transparent for a flat prediction instead of dividing by zero', () => {
    const alpha = toAlphaMask([0.3, 0.3, 0.3, 0.3], { width: 2, height: 2 });

    expect(Array.from(alpha)).toEqual([0, 0, 0, 0]);
  });

  it('interpolates between pixel centres when scaling up', () => {
    const alpha = toAlphaMask([0, 1, 0, 1], { width: 4, height: 1 });

    expect(Array.from(alpha)).toEqual([0, 64, 191, 255]);
  });

  it('interpolates between rows as well as columns', () => {
    const alpha = toAlphaMask([0, 0, 1, 1], { width: 1, height: 4 });

    expect(Array.from(alpha)).toEqual([0, 64, 191, 255]);
  });

  it('stretches a square prediction to a portrait photo, keeping top and bottom apart', () => {
    const alpha = toAlphaMask([1, 1, 0, 0], { width: 2, height: 3 });

    expect(Array.from(alpha)).toEqual([255, 255, 128, 128, 0, 0]);
  });

  it('keeps a prediction of the same size exactly as it is', () => {
    const output = [0, 10, 20, 30, 40, 50, 60, 70, 80];

    const alpha = toAlphaMask(output, { width: 3, height: 3 });

    expect(Array.from(alpha)).toEqual(
      output.map((value) => Math.round((value / 80) * 255)),
    );
  });

  it('blends both neighbours in both directions, holding the last row and column', () => {
    const alpha = toAlphaMask([1, 0, 0, 1], { width: 4, height: 4 });

    // Worked by hand: sample positions 0, 0.25, 0.75 and 1.25 (held at 1) along each axis.
    expect(Array.from(alpha)).toEqual([
      255, 191, 64, 0, 191, 159, 96, 64, 64, 96, 159, 191, 0, 64, 191, 255,
    ]);
  });

  it('samples the nearest pixels when scaling down', () => {
    const output = [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0];

    const alpha = toAlphaMask(output, { width: 2, height: 2 });

    expect(Array.from(alpha)).toEqual([0, 255, 255, 0]);
  });
});
