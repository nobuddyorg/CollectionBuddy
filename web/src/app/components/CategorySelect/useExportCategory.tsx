'use client';

import { useCallback, useRef, useState } from 'react';

import type { Translate } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { useBeforeUnloadGuard } from '../../lib/useBeforeUnloadGuard';
import type { ExportProgress } from '../../data/exportCategory';
import { formatExportBytes } from '../../data/exportFormat';
import { downloadBlob } from './downloadBlob';
import { useConfirm } from '../Confirm/ConfirmProvider';

// Checked by name: importing the classes would pull the on-demand export and ZIP code into the page.
const isNamed = (error: unknown, name: string): boolean =>
  error instanceof Error && error.name === name;

/** Reading counts up per page, photos count against their total, and "0 of 0" falls back to packing. */
export function exportProgressMessage(
  progress: ExportProgress | null,
  t: Translate,
): string | null {
  if (!progress) return null;
  if (progress.phase === 'photos' && progress.total > 0) {
    return t('category_select.export_photos', {
      done: progress.done,
      total: progress.total,
    });
  }
  if (progress.phase === 'items' && progress.done > 0) {
    return t('category_select.export_reading_count', { done: progress.done });
  }
  if (progress.phase === 'items') return t('category_select.export_reading');
  return t('category_select.export_packing');
}

export function useExportCategory() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
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
        const { exportCategory } = await import('../../data/exportCategory');
        const result = await exportCategory({
          category,
          onProgress: setProgress,
          signal: controller.signal,
          // Asked once the listing has totalled the real size; declining reads as a cancel.
          confirmLargeExport: (totalBytes) =>
            confirm(
              t('category_select.export_large_confirm', {
                size: formatExportBytes(totalBytes, locale),
              }),
            ),
        });
        downloadBlob(result.blob, result.filename);
        // Export-then-delete is a canonical use, so a skipped photograph must never go unsaid.
        if (result.skippedPhotoCount > 0) {
          toast.error(
            t('category_select.export_partial', {
              skipped: result.skippedPhotoCount,
              total: result.photoCount + result.skippedPhotoCount,
            }),
          );
        }
      } catch (error) {
        if (isNamed(error, 'ExportCancelledError')) {
          // Confirmed, not a failure.
          toast.announce(t('category_select.export_cancelled'));
        } else if (isNamed(error, 'ZipLimitError')) {
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
    [progress, t, locale, toast, confirm],
  );

  // Not memoized: it goes straight onto a button in a component nothing memoizes.
  const cancelExport = () => {
    controllerRef.current?.abort();
  };

  // An export can run for minutes; closing the tab mid-run would silently discard it.
  useBeforeUnloadGuard(progress !== null);

  return {
    isExporting: progress !== null,
    message: exportProgressMessage(progress, t),
    runExport,
    cancelExport,
  };
}
