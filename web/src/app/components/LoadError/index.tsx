'use client';

import { useI18n } from '../../i18n/useI18n';
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
    <section
      data-testid={testId}
      aria-labelledby={headingId}
      aria-busy={busy}
      className="py-16 grid place-items-center text-center"
    >
      <div className="flex flex-col items-center gap-4 max-w-xs">
        <div
          aria-hidden="true"
          className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl"
        >
          ⚠️
        </div>
        <div className="space-y-1.5">
          <h3
            id={headingId}
            data-testid="load-error-title"
            className="font-display text-lg text-foreground"
          >
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('common.load_error_hint')}
          </p>
        </div>
        <button
          type="button"
          data-testid="load-error-retry"
          onClick={onRetry}
          className={buttonClasses('text-foreground')}
        >
          {busy ? t('common.loading') : t('common.retry')}
        </button>
      </div>
    </section>
  );
}
