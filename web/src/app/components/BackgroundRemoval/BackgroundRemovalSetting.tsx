'use client';

import { useEffect, useId, useState } from 'react';
import Icon, { IconType } from '../Icon';
import { useI18n } from '../../i18n/useI18n';
import { downloadPercent } from './downloadPercent';
import {
  detectCachedModel,
  preloadModel,
  usePreloadState,
} from './modelPreload';
import { useBackgroundRemovalPreference } from './useBackgroundRemovalPreference';

function PreloadControl() {
  const { t } = useI18n();
  const state = usePreloadState();
  // The menu mounts this on every open, so a cut-out's download since the last one counts too.
  useEffect(() => {
    void detectCachedModel();
  }, []);
  if (state.status === 'ready') {
    return (
      <p role="status" data-testid="model-status" className="text-xs">
        {t('background_removal.preload_ready')}
      </p>
    );
  }
  if (state.status === 'downloading') {
    return (
      <p role="status" data-testid="model-status" className="text-xs">
        {t('background_removal.preload_progress', {
          percent: downloadPercent(state),
        })}
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
  const [hintOpen, setHintOpen] = useState(false);
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 min-h-9 text-sm cursor-pointer">
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
        <button
          type="button"
          data-testid="background-removal-info"
          aria-label={t('background_removal.info_label')}
          aria-expanded={hintOpen}
          aria-controls={hintId}
          onClick={() => setHintOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <Icon icon={IconType.Info} className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p
        id={hintId}
        hidden={!hintOpen}
        data-testid="background-removal-hint"
        className="text-xs text-muted-foreground"
      >
        {t('background_removal.setting_hint')}
      </p>
      {enabled && <PreloadControl />}
    </div>
  );
}
