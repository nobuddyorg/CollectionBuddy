import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { geocodePlace } from './photon';

const ok = (coordinates: [number, number]) => ({
  ok: true,
  status: 200,
  json: async () => ({ features: [{ geometry: { coordinates } }] }),
});
const status = (code: number) => ({
  ok: false,
  status: code,
  json: async () => ({}),
});

function lookup(
  signal = new AbortController().signal,
  awaitTurn = vi.fn(async () => {}),
) {
  const result = geocodePlace('Cologne', { lang: 'de', signal, awaitTurn });
  return { result, awaitTurn };
}

describe('geocodePlace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks Photon for one German match and reads its coordinates', async () => {
    const fetchMock = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValue(ok([6.96, 50.94]));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const { result } = lookup(controller.signal);

    await expect(result).resolves.toEqual({ lat: 50.94, lng: 6.96 });
    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get('q')).toBe('Cologne');
    expect(params.get('limit')).toBe('1');
    expect(params.get('lang')).toBe('de');
    expect(init).toEqual({ signal: controller.signal });
  });

  it('is null for a place Photon matches with nothing usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      }),
    );

    await expect(lookup().result).resolves.toBeNull();
  });

  it('gives up at once on an answer asking again cannot change', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookup().result).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a refusal and a network error, then takes the answer that came', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(status(429))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(ok([13.4, 52.52]));
    vi.stubGlobal('fetch', fetchMock);

    const { result, awaitTurn } = lookup();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(result).resolves.toEqual({ lat: 52.52, lng: 13.4 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Every attempt, not only the first, waits for its paced turn.
    expect(awaitTurn).toHaveBeenCalledTimes(3);
  });

  it('is null after three refusals, the moment the third one lands', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(503));
    vi.stubGlobal('fetch', fetchMock);
    let settled = false;

    const { result } = lookup();
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    await expect(result).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends nothing once its signal has aborted by the time its turn comes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(lookup(controller.signal).result).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry a lookup its own signal aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = lookup(controller.signal);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
