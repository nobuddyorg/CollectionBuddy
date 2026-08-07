'use client';

import { useCallback, useState } from 'react';

import type { TranslationKey } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import {
  downloadBlob,
  exportCategory,
  type ExportProgress,
} from '../../data/exportCategory';

/**
 * What to say while an export runs.
 *
 * An export is the one action in this panel that can take minutes, so the
 * button has to keep reporting rather than just spin: reading the rows and
 * packing the archive are short and get a word each, but fetching the
 * photographs is the long part and is the only phase that can be counted,
 * so that is the one that shows a count.
 *
 * A photo phase with nothing to fetch would otherwise read "0 of 0", which
 * looks like a stall; a category of items without pictures falls back to
 * the packing wording instead.
 */
export function exportProgressMessage(
  progress: ExportProgress | null,
  t: (key: TranslationKey) => string,
): string | null {
  if (!progress) return null;
  if (progress.phase === 'photos' && progress.total > 0) {
    return t('category_select.export_photos')
      .replace('{done}', String(progress.done))
      .replace('{total}', String(progress.total));
  }
  if (progress.phase === 'items') return t('category_select.export_reading');
  return t('category_select.export_packing');
}

export type UseExportCategory = ReturnType<typeof useExportCategory>;

/* v8 ignore start -- React state around one async I/O call;
 * exportProgressMessage above is the pure part and is what's tested. */
// Stryker disable all: hook internals aren't covered by tests.
export function useExportCategory() {
  const { t } = useI18n();
  const toast = useToast();
  // Null means "not exporting". A separate boolean would be a second
  // source of truth for the same fact, and the two could disagree.
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const runExport = useCallback(
    async (category: { id: string; name: string }) => {
      if (progress) return;
      setProgress({ phase: 'items', done: 0, total: 0 });
      try {
        const result = await exportCategory({
          category,
          onProgress: setProgress,
        });
        downloadBlob(result.blob, result.filename);
        // The download itself never fails on a skipped photograph -- an
        // archive missing a few pictures is still worth having -- but the
        // canonical use of an export is "export, then delete the
        // originals", so a silent gap here is unrecoverable data loss
        // rather than a mere inconvenience (#414).
        if (result.skippedPhotoCount > 0) {
          toast.error(
            t('category_select.exportPartial')
              .replace('{skipped}', String(result.skippedPhotoCount))
              .replace(
                '{total}',
                String(result.photoCount + result.skippedPhotoCount),
              ),
          );
        }
      } catch (e) {
        console.error(e);
        toast.error(t('category_select.exportError'));
      } finally {
        setProgress(null);
      }
    },
    [progress, t, toast],
  );

  return {
    progress,
    isExporting: progress !== null,
    message: exportProgressMessage(progress, t),
    runExport,
  };
}
// Stryker restore all
/* v8 ignore stop */
