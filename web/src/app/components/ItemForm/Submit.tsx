'use client';

import { Spinner } from '../ui/Spinner';

// Always a labelled button. This used to render as a bare "+" icon in the
// create and edit modals, which gave no indication of what confirming
// would do -- an action should say exactly what happens when it is used.
export function Submit({
  submitting,
  disabled,
  label,
}: {
  submitting: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      // Named for the end-to-end suite: the label differs between creating
      // and editing, and both are translated.
      data-testid="item-submit"
      disabled={disabled}
      aria-busy={submitting}
      className="min-h-11 px-4 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
    >
      {submitting && <Spinner size="sm" />}
      {label}
    </button>
  );
}
