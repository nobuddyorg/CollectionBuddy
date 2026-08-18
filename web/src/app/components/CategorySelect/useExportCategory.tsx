'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TranslationKey } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import {
  ExportCancelledError,
  exportCategory,
  type ExportProgress,
} from '../../data/exportCategory';
import { formatExportBytes } from '../../data/exportFormat';
import { downloadBlob } from './downloadBlob';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { ZipLimitError } from '../../data/zip';

/**
 * What to say while an export runs. Reading rows and packing the archive
 * are short and get a word each; fetching photographs is the long part and
 * the only phase worth a count. A photo phase with nothing to fetch falls
 * back to the packing wording instead of reading "0 of 0".
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
  const confirm = useConfirm();
  // Null means "not exporting" -- a separate boolean would be a second
  // source of truth that could disagree.
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  // One controller per run, so Cancel always aborts the export actually in
  // flight, not a stale one from a previous click.
  const controllerRef = useRef<AbortController | null>(null);

  const runExport = useCallback(
    async (category: { id: string; name: string }) => {
      if (progress) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      setProgress({ phase: 'items', done: 0, total: 0 });
      try {
        const result = await exportCategory({
          category,
          onProgress: setProgress,
          signal: controller.signal,
          // Asked once the listing has totalled the photographs' real
          // size; declining reads as a cancel.
          confirmLargeExport: (totalBytes) =>
            confirm(
              t('category_select.export_large_confirm').replace(
                '{size}',
                formatExportBytes(totalBytes),
              ),
            ),
        });
        downloadBlob(result.blob, result.filename);
        // The download never fails on a skipped photograph -- an archive
        // missing a few is still worth having -- but export-then-delete is
        // a canonical use, so a silent gap here is unrecoverable data loss.
        if (result.skippedItemCount > 0) {
          toast.error(
            t('category_select.export_listing_partial').replace(
              '{count}',
              String(result.skippedItemCount),
            ),
          );
        }
        if (result.skippedPhotoCount > 0) {
          toast.error(
            t('category_select.export_partial')
              .replace('{skipped}', String(result.skippedPhotoCount))
              .replace(
                '{total}',
                String(result.photoCount + result.skippedPhotoCount),
              ),
          );
        }
      } catch (e) {
        if (e instanceof ExportCancelledError) {
          // Confirmed, not a failure.
          toast.announce(t('category_select.export_cancelled'));
        } else if (e instanceof ZipLimitError) {
          // Retrying produces the same refusal, so this isn't "try again".
          toast.error(t('category_select.export_too_large'));
        } else {
          toast.reportError(
            'export category',
            e,
            t('category_select.export_error'),
          );
        }
      } finally {
        controllerRef.current = null;
        setProgress(null);
      }
    },
    [progress, t, toast, confirm],
  );

  const cancelExport = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  // An export can run for minutes; closing the tab mid-run would silently
  // discard it with no way back.
  useEffect(() => {
    if (!progress) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [progress]);

  return {
    progress,
    isExporting: progress !== null,
    message: exportProgressMessage(progress, t),
    runExport,
    cancelExport,
  };
}
// Stryker restore all
/* v8 ignore stop */
