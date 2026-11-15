'use client';

import { useI18n } from '../../i18n/useI18n';
import type { Crop } from '../../lib/backgroundRemoval';
import { Preview } from '../BackgroundRemoval/PhotoPreview';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';
import type { CropDraft, CropDraftApi } from './useCropDraft';

type Open = Exclude<CropDraft, { kind: 'closed' }>;

function useStatusText(draft: Open): string {
  const { t } = useI18n();
  if (draft.kind === 'ready') return t('item_list.crop_ready');
  if (draft.kind === 'unchanged') {
    return draft.reason === 'no-object'
      ? t('item_list.crop_no_object')
      : t('item_list.crop_already_framed');
  }
  if (draft.stage.kind === 'downloading') {
    return t('background_removal.preload_progress', {
      percent: draft.stage.percent,
    });
  }
  return draft.stage.kind === 'reading'
    ? t('item_list.crop_reading')
    : t('item_list.crop_finding');
}

/** The crop's panel under the photo: where it has got to, then Cancel and Save. */
export function CropControls({
  draft,
  actions,
  busy,
}: {
  draft: Open;
  actions: Pick<CropDraftApi, 'cancel' | 'save'>;
  /** Another change to this entry's photos is still on its way. */
  busy: boolean;
}) {
  const { t } = useI18n();
  const status = useStatusText(draft);
  const saving = draft.kind === 'ready' && draft.saving;

  return (
    <div
      role="group"
      data-testid="crop-controls"
      aria-label={t('item_list.crop_label')}
      className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md space-y-2 rounded-sm bg-card/95 p-3 shadow-lg ring-1 ring-control-border/60"
    >
      <p
        data-testid="crop-status"
        aria-live="polite"
        className="flex min-h-11 items-center gap-2 text-sm"
      >
        {draft.kind === 'working' && <Spinner size="sm" />}
        {status}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="crop-cancel"
          onClick={actions.cancel}
          disabled={saving}
          className={buttonClasses('w-full disabled:opacity-60')}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-testid="crop-save"
          onClick={() => void actions.save()}
          disabled={busy || draft.kind !== 'ready' || saving}
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

/** The crop in the original's place, on the chosen backdrop where a cut-out is see-through. */
export function CropPreview({
  crop,
  backdropClass,
}: {
  crop: Crop;
  backdropClass: string;
}) {
  const { t } = useI18n();
  return (
    <Preview
      blob={crop.blob}
      alt={t('item_list.crop_preview_alt')}
      testId="crop-preview"
      className={`w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg ${backdropClass}`}
    />
  );
}
