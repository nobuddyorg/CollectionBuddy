'use client';

import { useCallback, useRef, useState } from 'react';

import type { TranslationKey } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { useBeforeUnloadGuard } from '../../lib/useBeforeUnloadGuard';
import {
  ExportCancelledError,
  exportCategory,
  type ExportProgress,
} from '../../data/exportCategory';
import { formatExportBytes } from '../../data/exportFormat';
import { downloadBlob } from './downloadBlob';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { ZipLimitError } from '../../data/zip';

/** Reading counts up per page, photos count against their total, and "0 of 0" falls back to packing. */
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
  if (progress.phase === 'items' && progress.done > 0) {
    return t('category_select.export_reading_count').replace(
      '{done}',
      String(progress.done),
    );
  }
  if (progress.phase === 'items') return t('category_select.export_reading');
  return t('category_select.export_packing');
}

export function useExportCategory() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  // Null means not exporting; a separate boolean would be a second source of truth.
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  // One controller per run, so Cancel always aborts the export actually in flight.
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
          // Asked once the listing has totalled the real size; declining reads as a cancel.
          confirmLargeExport: (totalBytes) =>
            confirm(
              t('category_select.export_large_confirm').replace(
                '{size}',
                formatExportBytes(totalBytes),
              ),
            ),
        });
        downloadBlob(result.blob, result.filename);
        // Export-then-delete is a canonical use, so a skipped photograph must never go unsaid.
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
      } catch (error) {
        if (error instanceof ExportCancelledError) {
          // Confirmed, not a failure.
          toast.announce(t('category_select.export_cancelled'));
        } else if (error instanceof ZipLimitError) {
          // Retrying produces the same refusal, so this isn't "try again".
          toast.error(t('category_select.export_too_large'));
        } else {
          toast.reportError(
            'export category',
            error,
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

  // Not memoized: it goes straight onto a button in a component nothing memoizes.
  const cancelExport = () => {
    controllerRef.current?.abort();
  };

  // An export can run for minutes; closing the tab mid-run would silently discard it.
  useBeforeUnloadGuard(progress !== null);

  return {
    progress,
    isExporting: progress !== null,
    message: exportProgressMessage(progress, t),
    runExport,
    cancelExport,
  };
}
