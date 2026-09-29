import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportCancelledError } from './exportCancellation';
import { ExportError, signAll } from './exportCategory';
import type { SignUrls } from './exportCategory.test-support';

/** Answers each call in turn from `outcomes`: an error, or `ok` to sign the batch. */
function scriptedSignUrls(outcomes: (object | 'ok')[]) {
  return vi.fn(async (paths: string[]) => {
    const outcome = outcomes.shift() ?? 'ok';
    if (outcome === 'ok') {
      return {
        data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
        error: null,
      };
    }
    return { data: null, error: outcome };
  });
}

const unavailable = { message: 'down', status: 503, statusCode: '503' };

describe('signAll, retrying a sign call', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A transient 503 must not end an export.
  it('retries a sign call Storage could not serve right now, and signs the batch', async () => {
    const signUrls = scriptedSignUrls([unavailable]);

    const signing = signAll({
      paths: ['a', 'b'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      jitter: () => 1,
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(signUrls).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect([...(await signing)]).toEqual([
      ['a', 'signed://a'],
      ['b', 'signed://b'],
    ]);
    expect(signUrls).toHaveBeenCalledTimes(2);
  });

  // storage-js reports a request that never got an answer without any status.
  it('retries a sign call that got no response at all', async () => {
    const signUrls = scriptedSignUrls([{ message: 'Failed to fetch' }]);

    const signing = signAll({
      paths: ['a'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      jitter: () => 1,
    });
    await vi.advanceTimersByTimeAsync(10_000);

    expect((await signing).size).toBe(1);
    expect(signUrls).toHaveBeenCalledTimes(2);
  });

  it('fails the export with the last error once three attempts have failed', async () => {
    const last = { message: 'still down', status: 502, statusCode: '502' };
    const signUrls = scriptedSignUrls([unavailable, unavailable, last, 'ok']);

    const signing = signAll({
      paths: ['a'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      jitter: () => 1,
    });
    const failure = signing.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await failure;
    expect(error).toBeInstanceOf(ExportError);
    expect(error).toHaveProperty('cause', last);
    expect(signUrls).toHaveBeenCalledTimes(3);
  });

  it('gives up at once on a refusal no retry can change', async () => {
    const refused = { message: 'denied', status: 400, statusCode: '403' };
    const signUrls = scriptedSignUrls([refused, 'ok']);

    const signing = signAll({
      paths: ['a'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      jitter: () => 1,
    });
    const assertion = expect(signing).rejects.toHaveProperty('cause', refused);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(signUrls).toHaveBeenCalledOnce();
  });

  // Six batches failing together would otherwise all come back at the same instant.
  it("waits only the jitter's share of each backoff", async () => {
    const signUrls = scriptedSignUrls([unavailable, unavailable]);

    const signing = signAll({
      paths: ['a'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      jitter: () => 0.5,
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(signUrls).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(signUrls).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(signUrls).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    expect((await signing).size).toBe(1);
  });

  it('stops retrying once the caller cancels during the backoff', async () => {
    const controller = new AbortController();
    const signUrls = scriptedSignUrls([unavailable]);

    const signing = signAll({
      paths: ['a'],
      signUrls: signUrls as unknown as NonNullable<SignUrls>,
      signal: controller.signal,
      jitter: () => 1,
    });
    const assertion =
      expect(signing).rejects.toBeInstanceOf(ExportCancelledError);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(signUrls).toHaveBeenCalledOnce();
  });
});
