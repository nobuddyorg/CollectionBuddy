'use client';

import { useEffect } from 'react';

import { buttonClasses } from './components/ui/buttonClasses';
import { useI18n } from './i18n/useI18n';
import { shouldReloadForStaleBuild } from './lib/staleBuild';

const LAST_RELOAD_KEY = 'stale-build-reload-at';

/** Every page's error boundary: a chunk a deploy removed costs one reload, anything else gets a translated screen. */
export default function AppError({ error }: { error: Error }) {
  const { t } = useI18n();

  useEffect(() => {
    const now = Date.now();
    const lastReloadAt = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);
    if (!shouldReloadForStaleBuild({ error, lastReloadAt, now })) return;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
    window.location.reload();
  }, [error]);

  return (
    <main
      role="alert"
      data-testid="app-error"
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-6 text-center bg-background text-foreground"
    >
      <h1 className="font-display text-lg">{t('app_error.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('app_error.body')}</p>
      <button
        type="button"
        data-testid="app-error-reload"
        className={buttonClasses()}
        onClick={() => window.location.reload()}
      >
        {t('app_error.reload')}
      </button>
    </main>
  );
}
