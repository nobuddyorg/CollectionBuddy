/** What keeps a toast on screen past its time: a pointer over it, or keyboard focus inside it. */
export type HoldReason = 'hover' | 'focus';

export type Countdown =
  | { kind: 'running'; remainingMs: number; since: number }
  | { kind: 'held'; remainingMs: number; reasons: readonly HoldReason[] };

type Change = { reason: HoldReason; now: number };

export function startCountdown(durationMs: number, now: number): Countdown {
  return { kind: 'running', remainingMs: durationMs, since: now };
}

// Returns the same object when nothing changes, so a caller can tell a no-op and keep its timer.
export function holdCountdown(countdown: Countdown, change: Change): Countdown {
  if (countdown.kind === 'running') {
    const elapsed = change.now - countdown.since;
    return {
      kind: 'held',
      remainingMs: Math.max(0, countdown.remainingMs - elapsed),
      reasons: [change.reason],
    };
  }
  if (countdown.reasons.includes(change.reason)) return countdown;
  return { ...countdown, reasons: [...countdown.reasons, change.reason] };
}

export function releaseCountdown(
  countdown: Countdown,
  change: Change,
): Countdown {
  if (countdown.kind === 'running') return countdown;
  const reasons = countdown.reasons.filter(
    (reason) => reason !== change.reason,
  );
  if (reasons.length > 0) return { ...countdown, reasons };
  return {
    kind: 'running',
    remainingMs: countdown.remainingMs,
    since: change.now,
  };
}
