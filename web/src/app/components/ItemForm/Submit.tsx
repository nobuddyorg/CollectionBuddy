'use client';

import { filledButtonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';

export function Submit({
  submitting,
  label,
}: {
  submitting: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      // Named for the end-to-end suite: the label differs between creating and editing, and is translated.
      data-testid="item-submit"
      disabled={submitting}
      aria-busy={submitting}
      className={filledButtonClasses(
        'primary',
        'disabled:opacity-50 transition-opacity flex items-center justify-center gap-2',
      )}
    >
      {submitting && <Spinner size="sm" />}
      {label}
    </button>
  );
}
