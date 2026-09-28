'use client';

import { useCallback, useRef, useState } from 'react';

import {
  interpolate,
  type Translate,
  type TranslationKey,
} from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { useBeforeUnloadGuard } from '../../lib/useBeforeUnloadGuard';
import { ImportCancelledError } from '../../data/importCancellation';
import type { ImportProgress, ImportResult } from '../../data/importCategory';
import {
  ImportFormatError,
  type ImportFormatReason,
} from '../../data/importFormat';
import { uniqueCategoryName } from '../../data/categories';
import { isQuotaExceeded } from '../../data/quota';

/** What to say while an import runs. Same shape as exportProgressMessage. */
export function importProgressMessage(
  progress: ImportProgress | null,
  t: Translate,
): string | null {
  if (!progress) return null;
  if (progress.phase === 'photos' && progress.total > 0) {
    return t('category_select.import_photos', {
      done: progress.done,
      total: progress.total,
    });
  }
  if (progress.phase === 'reading') {
    return t('category_select.import_reading');
  }
  return t('category_select.import_items');
}

/** What each kind of unimportable archive says instead of "try again", which never helps. */
function formatErrorMessage(
  reason: ImportFormatReason,
  t: (key: TranslationKey) => string,
): string {
  if (reason === 'unreadable') {
    return t('category_select.import_unreadable_error');
  }
  if (reason === 'too_large') {
    return t('category_select.import_too_large_error');
  }
  return t('category_select.import_format_error');
}

function partialTemplate(
  quota: ImportResult['photoQuotaReached'],
  t: (key: TranslationKey) => string,
): string {
  if (quota === 'owner') return t('category_select.import_partial_quota');
  if (quota === 'app') return t('category_select.import_partial_storage_full');
  return t('category_select.import_partial');
}

/** The warning for photographs left out, naming the quota that stopped the rest; null when none was. */
export function importPartialMessage(
  {
    photoCount,
    skippedPhotoCount,
    photoQuotaReached,
  }: Pick<
    ImportResult,
    'photoCount' | 'skippedPhotoCount' | 'photoQuotaReached'
  >,
  t: (key: TranslationKey) => string,
): string | null {
  if (skippedPhotoCount === 0) return null;
  return interpolate(partialTemplate(photoQuotaReached, t), {
    skipped: skippedPhotoCount,
    total: photoCount + skippedPhotoCount,
  });
}

export function useImportCategory(existingCategoryNames: string[]) {
  const { t } = useI18n();
  const toast = useToast();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  // One controller per run, so Cancel always aborts the import actually in flight.
  const controllerRef = useRef<AbortController | null>(null);

  const runImport = useCallback(
    async (file: File, onImported?: (categoryId: string) => void) => {
      if (progress) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      setProgress({ phase: 'reading', done: 0, total: 0 });
      try {
        // On demand: the import and ZIP code is dead weight on every page load that never imports.
        const { importCategory } = await import('../../data/importCategory');
        const result = await importCategory({
          file,
          // "Coins (2)" if taken, named from the one read of the archive importCategory makes.
          nameCategory: (archivedName) =>
            uniqueCategoryName(archivedName, existingCategoryNames),
          onProgress: setProgress,
          signal: controller.signal,
        });
        onImported?.(result.category.id);
        toast.success(
          t('category_select.import_success', { name: result.category.name }),
        );
        const partial = importPartialMessage(result, t);
        if (partial) toast.error(partial);
      } catch (error) {
        if (error instanceof ImportCancelledError) {
          // Confirmed, not a failure.
          toast.announce(t('category_select.import_cancelled'));
        } else if (error instanceof ImportFormatError) {
          toast.reportError(
            'import category',
            error,
            formatErrorMessage(error.reason, t),
          );
        } else {
          toast.reportError(
            'import category',
            error,
            isQuotaExceeded(error)
              ? t('category_select.import_quota_error')
              : t('category_select.import_error'),
          );
        }
      } finally {
        controllerRef.current = null;
        setProgress(null);
      }
    },
    [progress, t, toast, existingCategoryNames],
  );

  // Not memoized: it goes straight onto a button in a component nothing memoizes.
  const cancelImport = () => {
    controllerRef.current?.abort();
  };

  // Same beforeunload guard as useExportCategory.tsx, for the same reason.
  useBeforeUnloadGuard(progress !== null);

  return {
    isImporting: progress !== null,
    message: importProgressMessage(progress, t),
    runImport,
    cancelImport,
  };
}
