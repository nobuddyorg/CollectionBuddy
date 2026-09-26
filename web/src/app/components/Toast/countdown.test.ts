import { describe, expect, it } from 'vitest';

import {
  type Countdown,
  holdCountdown,
  releaseCountdown,
  startCountdown,
} from './countdown';

describe('startCountdown', () => {
  it('runs the whole duration from now', () => {
    expect(startCountdown(6000, 1000)).toEqual({
      kind: 'running',
      remainingMs: 6000,
      since: 1000,
    });
  });
});

describe('holdCountdown', () => {
  it('stops a running countdown with the time it had left', () => {
    const running = startCountdown(6000, 1000);

    expect(holdCountdown(running, { reason: 'hover', now: 5000 })).toEqual({
      kind: 'held',
      remainingMs: 2000,
      reasons: ['hover'],
    });
  });

  it('never keeps a negative remainder when held after its time was up', () => {
    const running = startCountdown(6000, 1000);

    expect(
      holdCountdown(running, { reason: 'focus', now: 9000 }).remainingMs,
    ).toBe(0);
  });

  it('adds a second reason to a held countdown without touching its time', () => {
    const held = holdCountdown(startCountdown(6000, 0), {
      reason: 'hover',
      now: 1000,
    });

    expect(holdCountdown(held, { reason: 'focus', now: 4000 })).toEqual({
      kind: 'held',
      remainingMs: 5000,
      reasons: ['hover', 'focus'],
    });
  });

  it('hands back the same countdown when that reason already holds it', () => {
    const held = holdCountdown(startCountdown(6000, 0), {
      reason: 'hover',
      now: 1000,
    });

    expect(holdCountdown(held, { reason: 'hover', now: 3000 })).toBe(held);
  });
});

describe('releaseCountdown', () => {
  const heldBy = (...reasons: Array<'hover' | 'focus'>): Countdown => ({
    kind: 'held',
    remainingMs: 2500,
    reasons,
  });

  it('runs again from now with the time that was left once the last reason goes', () => {
    expect(
      releaseCountdown(heldBy('hover'), { reason: 'hover', now: 9000 }),
    ).toEqual({ kind: 'running', remainingMs: 2500, since: 9000 });
  });

  it('stays held while another reason still holds it', () => {
    expect(
      releaseCountdown(heldBy('hover', 'focus'), {
        reason: 'hover',
        now: 9000,
      }),
    ).toEqual(heldBy('focus'));
  });

  it('stays held when the released reason was not the one holding it', () => {
    expect(
      releaseCountdown(heldBy('focus'), { reason: 'hover', now: 9000 }),
    ).toEqual(heldBy('focus'));
  });

  it('hands back the same countdown when it is already running', () => {
    const running = startCountdown(6000, 1000);

    expect(releaseCountdown(running, { reason: 'focus', now: 4000 })).toBe(
      running,
    );
  });
});
