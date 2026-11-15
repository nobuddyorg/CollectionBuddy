'use client';

import { useRef, useState } from 'react';

import { downloadImageObject } from '../../data/images';
import { useI18n } from '../../i18n/useI18n';
import {
  inspectForRotation,
  type PhotoInspection,
} from '../../lib/photoRotation';
import {
  isUnturned,
  NO_ROTATION,
  totalDegrees,
  turnedBy,
  withAngle,
  type Rotation,
} from '../../lib/rotation';
import type { Straightening } from '../../lib/straighten';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';

/** The stored photo's bytes, turned clockwise by `degrees`: what a confirmed rotation saves. */
export type RotationEdit = { source: Blob; degrees: number };

/** The photo is read and inspected while the collector already turns it; only then can it be saved. */
type Inspection =
  | { kind: 'reading' }
  | { kind: 'ready'; source: Blob; inspection: PhotoInspection };

export type RotationDraft =
  | { kind: 'closed' }
  | {
      kind: 'editing';
      image: ImageEntry;
      rotation: Rotation;
      inspection: Inspection;
      saving: boolean;
    };

type Editing = Extract<RotationDraft, { kind: 'editing' }>;

const CLOSED: RotationDraft = { kind: 'closed' };

/** The straightening on offer: none until the photo is read, and none where its outline suggests nothing. */
export function straighteningOf(draft: Editing): Straightening {
  return draft.inspection.kind === 'ready'
    ? draft.inspection.inspection.straightening
    : { kind: 'none' };
}

type Ready = Editing & {
  inspection: Extract<Inspection, { kind: 'ready' }>;
};

/** Whether Save has anything to save, and the bytes to save it from. */
export function canSave(draft: RotationDraft): draft is Ready {
  return (
    draft.kind === 'editing' &&
    draft.inspection.kind === 'ready' &&
    !draft.saving &&
    !isUnturned(draft.rotation)
  );
}

/** One photo's rotation, from Rotate to Save or Cancel: previewed only, until `save` hands it on. */
export function useRotationDraft(
  onSave: (image: ImageEntry, edit: RotationEdit) => Promise<void>,
) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<RotationDraft>(CLOSED);
  // A photo read for a draft since cancelled, or replaced by another, must not land in the newer one.
  const opened = useRef(0);

  // Not memoized: handed straight to elements, which nothing memoizes.
  const editing = (update: (draft: Editing) => RotationDraft) =>
    setDraft((current) =>
      current.kind === 'editing' ? update(current) : current,
    );

  const start = async (image: ImageEntry) => {
    opened.current += 1;
    const attempt = opened.current;
    setDraft({
      kind: 'editing',
      image,
      rotation: NO_ROTATION,
      inspection: { kind: 'reading' },
      saving: false,
    });
    try {
      const downloaded = await downloadImageObject(image.pathFull);
      if (downloaded.error) throw downloaded.error;
      const inspection = await inspectForRotation(downloaded.data);
      if (attempt !== opened.current) return;
      editing((current) => ({
        ...current,
        inspection: { kind: 'ready', source: downloaded.data, inspection },
      }));
    } catch (error: unknown) {
      if (attempt !== opened.current) return;
      setDraft(CLOSED);
      toast.reportError(
        'load photo for rotation',
        error,
        t('item_list.rotate_load_error'),
      );
    }
  };

  const cancel = () => {
    opened.current += 1;
    setDraft(CLOSED);
  };

  const turn = (quarters: 1 | -1) =>
    editing((current) => ({
      ...current,
      rotation: turnedBy(current.rotation, quarters),
    }));

  const setAngle = (angle: number) =>
    editing((current) => ({
      ...current,
      rotation: withAngle(current.rotation, angle),
    }));

  const reset = () =>
    editing((current) => ({ ...current, rotation: NO_ROTATION }));

  const save = async () => {
    if (!canSave(draft)) return;
    const { image, rotation, inspection } = draft;
    editing((current) => ({ ...current, saving: true }));
    try {
      await onSave(image, {
        source: inspection.source,
        degrees: totalDegrees(rotation),
      });
    } finally {
      cancel();
    }
  };

  return { draft, start, cancel, turn, setAngle, reset, save };
}

export type RotationDraftApi = ReturnType<typeof useRotationDraft>;
