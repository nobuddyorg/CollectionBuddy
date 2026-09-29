'use client';

import { useI18n } from '../../i18n/useI18n';
import EmptyState from '../EmptyState';
import { buttonClasses } from '../ui/buttonClasses';

type Props = {
  /** Also prefixes the heading id, so two instances never share one. */
  testId: string;
  title: string;
  /** A retry in flight: the button stays enabled and focused, and repeating it is harmless. */
  busy: boolean;
  onRetry: () => void;
};

/** Stands in for a list that failed to load, so the failure never reads as an empty collection. */
export default function LoadError({ testId, title, busy, onRetry }: Props) {
  const { t } = useI18n();
  const headingId = `${testId}-title`;

  return (
    // Not a live region: the error toast already announced the failure; this is what stays once it has gone.
    <EmptyState
      symbol="⚠️"
      title={title}
      hint={t('common.load_error_hint')}
      titleId={headingId}
      titleTestId="load-error-title"
      data-testid={testId}
      aria-labelledby={headingId}
      aria-busy={busy}
    >
      <button
        type="button"
        data-testid="load-error-retry"
        onClick={onRetry}
        className={buttonClasses('text-foreground')}
      >
        {busy ? t('common.loading') : t('common.retry')}
      </button>
    </EmptyState>
  );
}
