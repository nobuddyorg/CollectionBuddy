'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { keepsWholePhoto } from '../../lib/manualCropFrame';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';
import type { ManualCrop, ManualCropApi } from './useManualCrop';

type Framing = Extract<ManualCrop, { kind: 'framing' }>;

/** A hand-drawn crop's panel under the photo: how to frame it, the card's 4:3, then Cancel and Save. */
export function ManualCropControls({
  crop,
  actions,
  busy,
}: {
  crop: Framing;
  actions: Pick<ManualCropApi, 'toggleLock' | 'cancel' | 'save'>;
  /** Another change to this entry's photos is still on its way. */
  busy: boolean;
}) {
  const { t } = useI18n();
  const lockId = useId();
  const { saving } = crop;
  // A frame round the whole photo would store the same photo again.
  const nothingToCrop = keepsWholePhoto(crop.frame, crop.size);

  return (
    <div
      role="group"
      data-testid="manual-crop-controls"
      aria-label={t('item_list.crop_by_hand')}
      className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md space-y-2 rounded-sm bg-card/95 p-3 shadow-lg ring-1 ring-control-border/60"
    >
      <p data-testid="manual-crop-hint" className="min-h-11 text-sm">
        {t('item_list.crop_by_hand_hint')}
      </p>
      <label
        htmlFor={lockId}
        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
      >
        <input
          id={lockId}
          type="checkbox"
          data-testid="manual-crop-lock"
          checked={crop.locked}
          onChange={actions.toggleLock}
          disabled={saving}
          className="h-5 w-5"
        />
        {t('item_list.crop_lock_aspect')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="manual-crop-cancel"
          onClick={actions.cancel}
          disabled={saving}
          className={buttonClasses('w-full disabled:opacity-60')}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-testid="manual-crop-save"
          onClick={() => void actions.save()}
          disabled={busy || saving || nothingToCrop}
          aria-busy={saving}
          className={filledButtonClasses(
            'primary',
            'flex w-full items-center justify-center gap-2 disabled:opacity-60',
          )}
        >
          {saving && <Spinner size="sm" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
