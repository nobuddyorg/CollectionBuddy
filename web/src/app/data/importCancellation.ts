/** Thrown when the caller's `signal` aborts: a user-requested cancel, not a failure. */
export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'ImportCancelledError';
  }
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportCancelledError();
}
