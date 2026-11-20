'use client';

import type { Translate } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { Preview } from '../BackgroundRemoval/PhotoPreview';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';
import type { StoredEdit, StoredEditApi } from './useStoredEdit';

type Open = Exclude<StoredEdit, { kind: 'closed' }>;

/** Where the edit has got to, or what came of it. */
function statusText(edit: Open, t: Translate): string {
  const crop = edit.tool === 'crop';
  if (edit.kind === 'ready') {
    return crop ? t('item_list.crop_ready') : t('item_list.cutout_ready');
  }
  if (edit.kind === 'unchanged') {
    if (edit.reason === 'already-framed') {
      return t('item_list.crop_already_framed');
    }
    return crop
      ? t('item_list.crop_no_object')
      : t('item_list.cutout_no_object');
  }
  const { stage } = edit;
  if (stage.kind === 'reading') return t('item_list.photo_reading');
  if (stage.kind === 'downloading') {
    return t('background_removal.preload_progress', { percent: stage.percent });
  }
  return crop ? t('item_list.crop_finding') : t('background_removal.working');
}

/** A crop's or cut-out's panel under the photo: where it has got to, then Cancel and Save. */
export function StoredEditControls({
  edit,
  actions,
  busy,
  cropByHand,
}: {
  edit: Open;
  actions: Pick<StoredEditApi, 'cancel' | 'save'>;
  /** Another change to this entry's photos is still on its way. */
  busy: boolean;
  /** Where the model found no item, a frame drawn by hand instead; `ready` once the photo it is drawn over has loaded. */
  cropByHand: { start: () => void; ready: boolean };
}) {
  const { t } = useI18n();
  const saving = edit.kind === 'ready' && edit.saving;
  const foundNothing =
    edit.kind === 'unchanged' &&
    edit.tool === 'crop' &&
    edit.reason === 'no-object';

  return (
    <div
      role="group"
      data-testid="edit-controls"
      aria-label={
        edit.tool === 'crop'
          ? t('item_list.crop_label')
          : t('item_list.remove_background')
      }
      className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md space-y-2 rounded-sm bg-card/95 p-3 shadow-lg ring-1 ring-control-border/60"
    >
      <p
        data-testid="edit-status"
        aria-live="polite"
        className="flex min-h-11 items-center gap-2 text-sm"
      >
        {edit.kind === 'working' && <Spinner size="sm" />}
        {statusText(edit, t)}
      </p>
      {foundNothing && (
        <button
          type="button"
          data-testid="edit-crop-by-hand"
          onClick={cropByHand.start}
          disabled={busy || !cropByHand.ready}
          className={buttonClasses('w-full disabled:opacity-60')}
        >
          {t('item_list.crop_by_hand_instead')}
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="edit-cancel"
          onClick={actions.cancel}
          disabled={saving}
          className={buttonClasses('w-full disabled:opacity-60')}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-testid="edit-save"
          onClick={() => void actions.save()}
          disabled={busy || edit.kind !== 'ready' || saving}
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

/** The result in the original's place, on the chosen backdrop where it is see-through. */
export function StoredEditPreview({
  edit,
  backdropClass,
}: {
  edit: Extract<StoredEdit, { kind: 'ready' }>;
  backdropClass: string;
}) {
  const { t } = useI18n();
  const { edited } = edit;
  return (
    <Preview
      blob={edited.blob}
      alt={
        edit.tool === 'crop'
          ? t('item_list.crop_preview_alt')
          : t('background_removal.cutout_alt')
      }
      testId="edit-preview"
      className={`w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg ${
        edited.transparent ? backdropClass : ''
      }`}
    />
  );
}
