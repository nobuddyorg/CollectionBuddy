'use client';

import { useEffect, useRef, useState } from 'react';

import { downloadImageObject } from '../../data/images';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import type { Crop, CutoutProgress } from '../../lib/backgroundRemoval';
import { downloadPercent } from '../BackgroundRemoval/downloadPercent';
import { loadBackgroundRemoval } from '../BackgroundRemoval/load';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';

/** How far a crop has come: reading the stored photo, downloading the model, then finding the object. */
export type CropStage =
  | { kind: 'reading' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'finding' };

export type CropDraft =
  | { kind: 'closed' }
  | { kind: 'working'; image: ImageEntry; stage: CropStage }
  | {
      kind: 'ready';
      image: ImageEntry;
      crop: Crop;
      /** An object URL of the crop, shown in the original's place until Save or Cancel. */
      previewUrl: string;
      saving: boolean;
    }
  /** Nothing to save: no object was found, or the photo is framed round it already. */
  | {
      kind: 'unchanged';
      image: ImageEntry;
      reason: 'no-object' | 'already-framed';
    };

const CLOSED: CropDraft = { kind: 'closed' };

/** The stage a worker's progress report puts the crop in. */
export function stageOf(progress: CutoutProgress): CropStage {
  return progress.stage === 'download'
    ? { kind: 'downloading', percent: downloadPercent(progress) }
    : { kind: 'finding' };
}

/** The crop as an upload: a cut-out stays see-through. */
export function uploadOf(crop: Crop): PhotoUpload {
  return {
    file: new File([crop.blob], 'cropped.png', { type: 'image/png' }),
    encoding: crop.transparent ? 'transparent' : 'opaque',
  };
}

/** One photo's crop to its object, from Crop to Save or Cancel: shown only, until `save` hands it on. */
export function useCropDraft(
  onSave: (image: ImageEntry, photo: PhotoUpload) => Promise<void>,
) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<CropDraft>(CLOSED);
  // Cancelling stops the worker, and so its ~200 MB of model, at once.
  const running = useRef(new AbortController());

  const previewUrl = draft.kind === 'ready' ? draft.previewUrl : '';
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  // Leaving the page while a crop works stops it too.
  useEffect(() => () => running.current.abort(), []);

  const fail = (message: string, error: unknown) => {
    setDraft(CLOSED);
    toast.reportError('crop photo', error, message);
  };

  const start = async (image: ImageEntry) => {
    running.current.abort();
    const controller = new AbortController();
    running.current = controller;
    const progress = (stage: CropStage) =>
      setDraft({ kind: 'working', image, stage });
    progress({ kind: 'reading' });
    const downloaded = await downloadImageObject(image.pathFull);
    if (controller.signal.aborted) return;
    if (downloaded.error) {
      fail(t('item_list.crop_load_error'), downloaded.error);
      return;
    }
    try {
      const { cropToObject, NoObjectFoundError } =
        await loadBackgroundRemoval();
      const result = await cropToObject(downloaded.data, {
        signal: controller.signal,
        onProgress: (report) => progress(stageOf(report)),
      }).catch((error: unknown) => {
        if (error instanceof NoObjectFoundError) return 'no-object' as const;
        throw error;
      });
      if (result === 'no-object' || result.kind === 'already-framed') {
        setDraft({
          kind: 'unchanged',
          image,
          reason: result === 'no-object' ? result : result.kind,
        });
        return;
      }
      setDraft({
        kind: 'ready',
        image,
        crop: result.crop,
        previewUrl: URL.createObjectURL(result.crop.blob),
        saving: false,
      });
    } catch (error: unknown) {
      if (!controller.signal.aborted) fail(t('item_list.crop_error'), error);
    }
  };

  const cancel = () => {
    running.current.abort();
    setDraft(CLOSED);
  };

  const save = async () => {
    if (draft.kind !== 'ready' || draft.saving) return;
    setDraft({ ...draft, saving: true });
    try {
      await onSave(draft.image, uploadOf(draft.crop));
    } finally {
      setDraft(CLOSED);
    }
  };

  return { draft, start, cancel, save };
}

export type CropDraftApi = ReturnType<typeof useCropDraft>;
