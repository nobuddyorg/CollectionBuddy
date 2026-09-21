import { describe, expect, it } from 'vitest';

import { attempts, backoffDelayMs } from './backoff';

describe('backoffDelayMs', () => {
  it('waits the base delay before the first retry', () => {
    expect(backoffDelayMs(100, 0)).toBe(100);
  });

  it('doubles for each further attempt', () => {
    expect(backoffDelayMs(100, 1)).toBe(200);
    expect(backoffDelayMs(100, 2)).toBe(400);
    expect(backoffDelayMs(100, 3)).toBe(800);
  });
});

describe('attempts', () => {
  it('counts from zero, so the first pass is attempt 0 and waits nothing', () => {
    expect(attempts(3)).toEqual([0, 1, 2]);
  });

  it('gives exactly as many passes as it was asked for', () => {
    expect(attempts(1)).toEqual([0]);
    expect(attempts(5)).toHaveLength(5);
  });

  // A retry budget of nothing is not one free attempt.
  it('has nothing to walk at zero', () => {
    expect(attempts(0)).toEqual([]);
  });
});
