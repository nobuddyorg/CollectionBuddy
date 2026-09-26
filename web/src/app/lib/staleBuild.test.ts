import { describe, expect, it } from 'vitest';

import { RELOAD_GUARD_MS, shouldReloadForStaleBuild } from './staleBuild';

function chunkLoadError() {
  const error = new Error('Failed to load chunk /_next/static/chunks/a.js');
  error.name = 'ChunkLoadError';
  return error;
}

const NOW = 1_000_000;

describe('shouldReloadForStaleBuild', () => {
  it('reloads for a chunk a deploy removed, when no reload happened yet', () => {
    expect(
      shouldReloadForStaleBuild({
        error: chunkLoadError(),
        lastReloadAt: 0,
        now: NOW,
      }),
    ).toBe(true);
  });

  // The chunk is still missing after the one reload: show the error screen instead of looping.
  it('refuses a second reload inside the guard window', () => {
    expect(
      shouldReloadForStaleBuild({
        error: chunkLoadError(),
        lastReloadAt: NOW - RELOAD_GUARD_MS + 1,
        now: NOW,
      }),
    ).toBe(false);
  });

  // A later deploy in the same tab deserves its own recovery.
  it('reloads again once the guard window has passed', () => {
    expect(
      shouldReloadForStaleBuild({
        error: chunkLoadError(),
        lastReloadAt: NOW - RELOAD_GUARD_MS,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('never reloads for any other error, which a reload would not fix', () => {
    expect(
      shouldReloadForStaleBuild({
        error: new TypeError('x is undefined'),
        lastReloadAt: 0,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('refuses when the stored time is unreadable', () => {
    expect(
      shouldReloadForStaleBuild({
        error: chunkLoadError(),
        lastReloadAt: Number.NaN,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('holds the guard window at thirty seconds', () => {
    expect(RELOAD_GUARD_MS).toBe(30_000);
  });
});
