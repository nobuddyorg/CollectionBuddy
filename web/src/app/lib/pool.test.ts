import { describe, expect, it, vi } from 'vitest';

import { runPool } from './pool';

describe('runPool', () => {
  it('runs every item to completion', async () => {
    const seen: number[] = [];
    await runPool({
      items: [1, 2, 3],
      concurrency: 2,
      worker: async (item) => {
        seen.push(item);
      },
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it('never starts more workers than there are items', async () => {
    let concurrent = 0;
    let max = 0;
    await runPool({
      items: [1, 2],
      concurrency: 5,
      worker: async () => {
        concurrent++;
        max = Math.max(max, concurrent);
        await Promise.resolve();
        concurrent--;
      },
    });
    expect(max).toBeLessThanOrEqual(2);
  });

  it('rethrows a real Error from a failing worker unchanged', async () => {
    const failure = new Error('worker failed');
    await expect(
      runPool({
        items: [1],
        concurrency: 1,
        worker: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });

  it('wraps a non-Error thrown by a worker into a real Error', async () => {
    let caught: unknown;
    try {
      await runPool({
        items: [1],
        concurrency: 1,
        worker: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- a non-Error throw is the behavior under test
          throw 'plain string failure';
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('plain string failure');
  });

  it('stops picking up new items once one has failed, but lets in-flight ones settle', async () => {
    const started: number[] = [];
    const finished: number[] = [];

    await expect(
      runPool({
        items: [1, 2, 3, 4],
        concurrency: 2,
        worker: async (item) => {
          started.push(item);
          if (item === 1) {
            throw new Error('first item fails immediately');
          }
          // Item 2 is the other runner's in-flight work when item 1 fails; it must still finish.
          await Promise.resolve();
          finished.push(item);
        },
      }),
    ).rejects.toThrow('first item fails immediately');

    // 3 and 4 were never picked up once the pool recorded a failure.
    expect(started.sort()).toEqual([1, 2]);
    expect(finished).toEqual([2]);
  });

  it('reports only the first failure when several workers fail', async () => {
    const onReject = vi.fn();
    await runPool({
      items: [1, 2],
      concurrency: 2,
      worker: async (item) => {
        throw new Error(`item ${item} failed`);
      },
    }).catch(onReject);

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('resolves immediately for an empty item list', async () => {
    const worker = vi.fn();
    await expect(
      runPool({ items: [], concurrency: 3, worker }),
    ).resolves.toBeUndefined();
    expect(worker).not.toHaveBeenCalled();
  });
});
