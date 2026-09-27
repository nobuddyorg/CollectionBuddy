import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  backoffDelayMs,
  isRetryableStatus,
  retryWithBackoff,
  startSpacer,
} from './backoff';

describe('backoffDelayMs', () => {
  it('waits the base delay before the first retry', () => {
    expect(backoffDelayMs(100, 0, 1)).toBe(100);
  });

  it('doubles for each further attempt', () => {
    expect(backoffDelayMs(100, 1, 1)).toBe(200);
    expect(backoffDelayMs(100, 2, 1)).toBe(400);
    expect(backoffDelayMs(100, 3, 1)).toBe(800);
  });

  it('scales the whole backoff by its share, so a draw of zero waits not at all', () => {
    expect(backoffDelayMs(100, 2, 0.25)).toBe(100);
    expect(backoffDelayMs(100, 0, 0.5)).toBe(50);
    expect(backoffDelayMs(100, 3, 0)).toBe(0);
  });
});

describe('isRetryableStatus', () => {
  it('asks again when the service refused to serve right now', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('asks again when the service is broken right now', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('gives up on an answered request, however unwelcome the answer', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(499)).toBe(false);
  });
});

/** Settles `promise` under fake timers, recording when it did. */
function settledAt<T>(promise: Promise<T>) {
  const state: { value?: T; at?: number } = {};
  void promise.then((value) => {
    state.value = value;
    state.at = Date.now();
  });
  return state;
}

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first answer that needs no retry, without waiting', async () => {
    const run = vi.fn(async () => ({ value: 'done', retry: false }));

    const result = settledAt(
      retryWithBackoff({ maxAttempts: 3, baseMs: 500, run }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({ value: 'done', at: 0 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('backs off the base delay, then twice it, before each retry', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ value: 'first', retry: true })
      .mockResolvedValueOnce({ value: 'second', retry: true })
      .mockResolvedValueOnce({ value: 'third', retry: false });

    const result = settledAt(
      retryWithBackoff({ maxAttempts: 3, baseMs: 500, run }),
    );
    await vi.advanceTimersByTimeAsync(499);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    expect(result).toEqual({ value: 'third', at: 1500 });
  });

  it('waits only the drawn share of each backoff, drawing afresh before every retry', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ value: 'first', retry: true })
      .mockResolvedValueOnce({ value: 'second', retry: true })
      .mockResolvedValueOnce({ value: 'third', retry: false });
    const jitter = vi.fn().mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);

    const result = settledAt(
      retryWithBackoff({ maxAttempts: 3, baseMs: 500, run, jitter }),
    );
    await vi.advanceTimersByTimeAsync(249);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    // 0.25 of the second backoff's 1000ms.
    await vi.advanceTimersByTimeAsync(250);
    expect(result).toEqual({ value: 'third', at: 500 });
    expect(jitter).toHaveBeenCalledTimes(2);
  });

  // Waiting after the final attempt only delays the caller learning it failed.
  it('returns the last answer as soon as the attempts run out, never waiting after it', async () => {
    const run = vi.fn(async () => ({
      value: run.mock.calls.length,
      retry: true,
    }));

    const result = settledAt(
      retryWithBackoff({ maxAttempts: 3, baseMs: 500, run }),
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ value: 3, at: 1500 });
  });

  it('makes one attempt when allowed one, and stops there', async () => {
    const run = vi.fn(async () => ({ value: 'only', retry: true }));

    const result = settledAt(
      retryWithBackoff({ maxAttempts: 1, baseMs: 500, run }),
    );
    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ value: 'only', at: 0 });
  });

  it('lets an attempt that throws end the retry at once', async () => {
    const run = vi.fn(async () => {
      throw new Error('cancelled');
    });

    await expect(
      retryWithBackoff({ maxAttempts: 3, baseMs: 500, run }),
    ).rejects.toThrow('cancelled');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('startSpacer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the first turn at once and each later one a gap after the one before', async () => {
    const awaitTurn = startSpacer(300);

    const turns = [awaitTurn(), awaitTurn(), awaitTurn()].map(settledAt);
    await vi.advanceTimersByTimeAsync(0);
    expect(turns.map((turn) => turn.at)).toEqual([0, undefined, undefined]);
    await vi.advanceTimersByTimeAsync(299);
    expect(turns[1].at).toBeUndefined();
    await vi.advanceTimersByTimeAsync(301);

    expect(turns.map((turn) => turn.at)).toEqual([0, 300, 600]);
  });

  it('gives a turn at once when the last one was at least a gap ago', async () => {
    const awaitTurn = startSpacer(300);
    await awaitTurn();
    await vi.advanceTimersByTimeAsync(1000);

    const turn = settledAt(awaitTurn());
    await vi.advanceTimersByTimeAsync(0);

    expect(turn.at).toBe(1000);
  });

  it('keeps separate spacers independent', async () => {
    const first = startSpacer(300);
    const second = startSpacer(300);
    await first();

    const turn = settledAt(second());
    await vi.advanceTimersByTimeAsync(0);

    expect(turn.at).toBe(0);
  });
});
