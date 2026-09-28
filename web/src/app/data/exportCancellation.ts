/** Thrown when the caller's `signal` aborts: a user-requested cancel, not a failure. */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError();
}
