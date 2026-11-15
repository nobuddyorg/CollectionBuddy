'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { isUnturned, MAX_FREE_ANGLE } from '../../lib/rotation';
import Icon, { IconType } from '../Icon';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { Spinner, StatusSpinner } from '../ui/Spinner';
import {
  canSave,
  straighteningOf,
  type RotationDraft,
  type RotationDraftApi,
} from './useRotationDraft';

// Framed like the labelled buttons below it, so the panel's left edge reads as one line.
const FRAMED_ICON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-sm ring-1 ring-inset ring-control-border hover:bg-muted transition-colors disabled:opacity-60';

/** The rotation's tools under the photo it previews: quarter turns, a free angle, Straighten where it applies, Save. */
export function RotationControls({
  draft,
  actions,
  busy,
}: {
  draft: Extract<RotationDraft, { kind: 'editing' }>;
  actions: Omit<RotationDraftApi, 'draft' | 'start'>;
  /** Another change to this entry's photos is still on its way. */
  busy: boolean;
}) {
  const { t } = useI18n();
  const detentsId = useId();
  const { rotation } = draft;
  const locked = busy || draft.saving;
  const straightening = straighteningOf(draft);
  // Reset takes the whole row unless the spinner or Straighten shares it.
  const hasSecondTool =
    draft.inspection.kind === 'reading' || straightening.kind === 'straighten';
  const angleText = t('item_list.rotation_angle_value', {
    angle: rotation.angle,
  });

  return (
    <div
      role="group"
      data-testid="rotation-controls"
      aria-label={t('item_list.rotate_label')}
      className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md space-y-2 rounded-sm bg-card/95 p-3 shadow-lg ring-1 ring-control-border/60"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={FRAMED_ICON}
          data-testid="rotate-left"
          onClick={() => actions.turn(-1)}
          disabled={locked}
          title={t('item_list.rotate_left')}
          aria-label={t('item_list.rotate_left')}
        >
          <Icon icon={IconType.RotateLeft} className="w-5 h-5" />
        </button>
        <button
          type="button"
          className={FRAMED_ICON}
          data-testid="rotate-right"
          onClick={() => actions.turn(1)}
          disabled={locked}
          title={t('item_list.rotate_right')}
          aria-label={t('item_list.rotate_right')}
        >
          <Icon icon={IconType.RotateRight} className="w-5 h-5" />
        </button>
        <input
          type="range"
          data-testid="rotation-angle"
          min={-MAX_FREE_ANGLE}
          max={MAX_FREE_ANGLE}
          step={0.1}
          // Browsers snap a range input to its list's values: the centre detent at 0°.
          list={detentsId}
          value={rotation.angle}
          onChange={(event) => actions.setAngle(Number(event.target.value))}
          disabled={locked}
          aria-label={t('item_list.rotation_angle')}
          aria-valuetext={angleText}
          className="ml-1 min-h-11 min-w-0 flex-1 accent-primary"
        />
        <datalist id={detentsId}>
          <option value="0" />
        </datalist>
        <output
          data-testid="rotation-angle-value"
          className="w-14 shrink-0 text-right font-label text-xs tabular-nums text-muted-foreground"
        >
          {angleText}
        </output>
      </div>

      {/* Equal columns, so each row's edges line up with the next. */}
      <div className="grid grid-cols-2 gap-2">
        {draft.inspection.kind === 'reading' && (
          <span className="flex min-h-11 items-center justify-center">
            <StatusSpinner size="sm" label={t('item_list.rotate_reading')} />
          </span>
        )}
        {straightening.kind === 'straighten' && (
          <button
            type="button"
            data-testid="straighten-image"
            onClick={() => actions.setAngle(straightening.degrees)}
            disabled={locked || rotation.angle === straightening.degrees}
            className={buttonClasses('w-full disabled:opacity-60')}
          >
            {t('item_list.straighten')}
          </button>
        )}
        <button
          type="button"
          data-testid="rotation-reset"
          onClick={actions.reset}
          disabled={locked || isUnturned(rotation)}
          className={buttonClasses(
            `w-full disabled:opacity-60 ${hasSecondTool ? '' : 'col-span-2'}`,
          )}
        >
          {t('item_list.rotation_reset')}
        </button>
        <button
          type="button"
          data-testid="rotation-cancel"
          onClick={actions.cancel}
          disabled={draft.saving}
          className={buttonClasses('w-full disabled:opacity-60')}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-testid="rotation-save"
          onClick={() => void actions.save()}
          disabled={busy || !canSave(draft)}
          aria-busy={draft.saving}
          className={filledButtonClasses(
            'primary',
            'flex w-full items-center justify-center gap-2 disabled:opacity-60',
          )}
        >
          {draft.saving && <Spinner size="sm" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
