'use client';

import { useId } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { preloadModel, usePreloadState } from './coinModelPreload';
import { useCoinCutoutPreference } from './useCoinCutoutPreference';

function PreloadControl() {
  const { t } = useI18n();
  const state = usePreloadState();
  if (state.status === 'ready') {
    return (
      <p role="status" data-testid="coin-model-status" className="text-xs">
        {t('coin_cutout.preload_ready')}
      </p>
    );
  }
  if (state.status === 'downloading') {
    const percent =
      state.total > 0
        ? Math.min(100, Math.round((state.loaded / state.total) * 100))
        : 0;
    return (
      <p role="status" data-testid="coin-model-status" className="text-xs">
        {t('coin_cutout.preload_progress', { percent })}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {state.status === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {t('coin_cutout.preload_failed')}
        </p>
      )}
      <button
        type="button"
        data-testid="coin-model-preload"
        onClick={() => void preloadModel()}
        className="w-full text-left px-2 min-h-9 rounded-sm ring-1 ring-inset ring-control-border hover:bg-muted text-xs transition-colors"
      >
        {t('coin_cutout.preload')}
      </button>
    </div>
  );
}

/** The opt-in, off by default: until someone ticks it, uploads work exactly as before and nothing is downloaded. */
export function CoinCutoutSetting() {
  const { t } = useI18n();
  const { enabled, setEnabled } = useCoinCutoutPreference();
  const hintId = useId();
  return (
    <div className="px-3 py-2 space-y-1.5">
      <label className="flex items-center gap-2 min-h-9 text-sm cursor-pointer">
        <input
          type="checkbox"
          data-testid="coin-cutout-toggle"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          aria-describedby={hintId}
          className="h-4 w-4 accent-primary"
        />
        {t('coin_cutout.setting_label')}
      </label>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('coin_cutout.setting_hint')}
      </p>
      {enabled && <PreloadControl />}
    </div>
  );
}
