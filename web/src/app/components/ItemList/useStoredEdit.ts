'use client';

import { useEffect, useRef, useState } from 'react';

import { downloadImageObject } from '../../data/images';
import type { PhotoUpload } from '../../data/photoType';
import { useI18n } from '../../i18n/useI18n';
import type { CutoutProgress } from '../../lib/backgroundRemoval';
import { downloadPercent } from '../BackgroundRemoval/downloadPercent';
import { loadBackgroundRemoval } from '../BackgroundRemoval/load';
import { useToast } from '../Toast/ToastProvider';
import type { ImageEntry } from './types';

/** The two edits that find the item in a stored photo: crop to it, or take its background away. */
export type EditTool = 'crop' | 'cut-out';

/** How far an edit has come: reading the stored photo, downloading the model, then working on the item. */
export type EditStage =
  | { kind: 'reading' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'working' };

/** An edit's result, losslessly as PNG for the upload to compress once. */
export type Edited = { blob: Blob; transparent: boolean };

/** Nothing to save: no item was found, or (a crop) the photo is framed round it already. */
export type Unchanged = 'no-object' | 'already-framed';

export type StoredEdit =
  | { kind: 'closed' }
  | { kind: 'working'; tool: EditTool; image: ImageEntry; stage: EditStage }
  /** The result shows in the original's place until Save or Cancel. */
  | {
      kind: 'ready';
      tool: EditTool;
      image: ImageEntry;
      edited: Edited;
      saving: boolean;
    }
  | { kind: 'unchanged'; tool: EditTool; image: ImageEntry; reason: Unchanged };

const CLOSED: StoredEdit = { kind: 'closed' };

/** The stage a worker's progress report puts the edit in. */
export function stageOf(progress: CutoutProgress): EditStage {
  return progress.stage === 'download'
    ? { kind: 'downloading', percent: downloadPercent(progress) }
    : { kind: 'working' };
}

/** The result as an upload: a cut-out, or a crop of one, stays see-through. */
export function uploadOf({ blob, transparent }: Edited): PhotoUpload {
  return {
    file: new File([blob], 'edited.png', { type: 'image/png' }),
    encoding: transparent ? 'transparent' : 'opaque',
  };
}

type Module = Awaited<ReturnType<typeof loadBackgroundRemoval>>;
type JobOptions = Parameters<Module['cropToObject']>[1];

/** Runs `tool` on the stored photo in the photo worker: its result, or why there is nothing to save. */
async function runTool(
  tool: EditTool,
  { file, options }: { file: Blob; options: JobOptions },
): Promise<Edited | Unchanged> {
  const { cropToObject, removeBackground, NoObjectFoundError } =
    await loadBackgroundRemoval();
  try {
    if (tool === 'cut-out') {
      const cutout = await removeBackground(file, options);
      return { blob: cutout.blob, transparent: true };
    }
    const result = await cropToObject(file, options);
    return result.kind === 'cropped' ? result.crop : result.kind;
  } catch (error: unknown) {
    if (error instanceof NoObjectFoundError) return 'no-object';
    throw error;
  }
}

/** One stored photo's crop or cut-out, from its button to Save or Cancel: shown only, until `save` hands it on. */
export function useStoredEdit(
  onSave: (image: ImageEntry, photo: PhotoUpload) => Promise<void>,
) {
  const { t } = useI18n();
  const toast = useToast();
  const [edit, setEdit] = useState<StoredEdit>(CLOSED);
  // Cancelling stops the worker, and so its ~200 MB of model, at once.
  const running = useRef(new AbortController());

  // Leaving the page while an edit works stops it too.
  useEffect(() => () => running.current.abort(), []);

  const fail = (message: string, error: unknown) => {
    setEdit(CLOSED);
    toast.reportError('edit photo', error, message);
  };

  const start = async (image: ImageEntry, tool: EditTool) => {
    running.current.abort();
    const controller = new AbortController();
    running.current = controller;
    const progress = (stage: EditStage) =>
      setEdit({ kind: 'working', tool, image, stage });
    progress({ kind: 'reading' });
    const downloaded = await downloadImageObject(image.pathFull);
    if (controller.signal.aborted) return;
    if (downloaded.error) {
      fail(
        tool === 'crop'
          ? t('item_list.crop_load_error')
          : t('item_list.remove_background_load_error'),
        downloaded.error,
      );
      return;
    }
    try {
      const result = await runTool(tool, {
        file: downloaded.data,
        options: {
          signal: controller.signal,
          onProgress: (report) => progress(stageOf(report)),
        },
      });
      setEdit(
        typeof result === 'string'
          ? { kind: 'unchanged', tool, image, reason: result }
          : { kind: 'ready', tool, image, edited: result, saving: false },
      );
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      fail(
        tool === 'crop'
          ? t('item_list.crop_error')
          : t('item_list.cutout_error'),
        error,
      );
    }
  };

  const cancel = () => {
    running.current.abort();
    setEdit(CLOSED);
  };

  const save = async () => {
    if (edit.kind !== 'ready' || edit.saving) return;
    setEdit({ ...edit, saving: true });
    try {
      await onSave(edit.image, uploadOf(edit.edited));
    } finally {
      setEdit(CLOSED);
    }
  };

  return { edit, start, cancel, save };
}

export type StoredEditApi = ReturnType<typeof useStoredEdit>;
