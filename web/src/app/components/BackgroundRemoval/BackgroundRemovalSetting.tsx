'use client';

import { useId } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { preloadModel, usePreloadState } from './modelPreload';
import { useBackgroundRemovalPreference } from './useBackgroundRemovalPreference';

function PreloadControl() {
  const { t } = useI18n();
  const state = usePreloadState();
  if (state.status === 'ready') {
    return (
      <p role="status" data-testid="model-status" className="text-xs">
        {t('background_removal.preload_ready')}
      </p>
    );
  }
  if (state.status === 'downloading') {
    const percent =
      state.total > 0
        ? Math.min(100, Math.round((state.loaded / state.total) * 100))
        : 0;
    return (
      <p role="status" data-testid="model-status" className="text-xs">
        {t('background_removal.preload_progress', { percent })}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {state.status === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {t('background_removal.preload_failed')}
        </p>
      )}
      <button
        type="button"
        data-testid="model-preload"
        onClick={() => void preloadModel()}
        className="w-full text-left px-2 min-h-9 rounded-sm ring-1 ring-inset ring-control-border hover:bg-muted text-xs transition-colors"
      >
        {t('background_removal.preload')}
      </button>
    </div>
  );
}

/** The opt-in, off by default: until someone ticks it, uploads work exactly as before and nothing is downloaded. */
export function BackgroundRemovalSetting() {
  const { t } = useI18n();
  const { enabled, setEnabled } = useBackgroundRemovalPreference();
  const hintId = useId();
  return (
    <div className="px-3 py-2 space-y-1.5">
      <label className="flex items-center gap-2 min-h-9 text-sm cursor-pointer">
        <input
          type="checkbox"
          data-testid="background-removal-toggle"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          aria-describedby={hintId}
          className="h-4 w-4 accent-primary"
        />
        {t('background_removal.setting_label')}
      </label>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('background_removal.setting_hint')}
      </p>
      {enabled && <PreloadControl />}
    </div>
  );
}
