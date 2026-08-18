'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TranslationKey } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import {
  ImportCancelledError,
  importCategory,
  type ImportProgress,
} from '../../data/importCategory';
import {
  findManifestPath,
  ImportFormatError,
  parseManifest,
} from '../../data/importFormat';
import { uniqueCategoryName } from '../../data/categories';
import { readZipEntries } from '../../data/zip';

/** What to say while an import runs. Same shape as exportProgressMessage. */
export function importProgressMessage(
  progress: ImportProgress | null,
  t: (key: TranslationKey) => string,
): string | null {
  if (!progress) return null;
  if (progress.phase === 'photos' && progress.total > 0) {
    return t('category_select.import_photos')
      .replace('{done}', String(progress.done))
      .replace('{total}', String(progress.total));
  }
  if (progress.phase === 'reading') {
    return t('category_select.import_reading');
  }
  return t('category_select.import_items');
}

export type UseImportCategory = ReturnType<typeof useImportCategory>;

/* v8 ignore start -- React state around one async I/O call;
 * importProgressMessage above is the pure part and is what's tested. */
// Stryker disable all: hook internals aren't covered by tests.
export function useImportCategory(existingCategoryNames: string[]) {
  const { t } = useI18n();
  const toast = useToast();
  // Null means "not importing" -- a separate boolean would be a second
  // source of truth that could disagree.
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  // One controller per run, so Cancel always aborts the import actually in
  // flight, not a stale one from a previous pick.
  const controllerRef = useRef<AbortController | null>(null);

  const runImport = useCallback(
    async (file: File, onImported?: (categoryId: string) => void) => {
      if (progress) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      setProgress({ phase: 'reading', done: 0, total: 0 });
      try {
        // Peeked ahead of the real read only to name the category first:
        // disambiguated against existing names the way a filesystem calls
        // a second copy "Coins (2)" rather than overwriting the first.
        const entries = await readZipEntries(file);
        const manifestPath = findManifestPath(entries.keys());
        if (!manifestPath) {
          throw new ImportFormatError('Not a CollectionBuddy export archive');
        }
        const manifest = parseManifest(
          JSON.parse(new TextDecoder().decode(entries.get(manifestPath))),
        );
        const categoryName = uniqueCategoryName(
          manifest.category.name,
          existingCategoryNames,
        );

        const result = await importCategory({
          file,
          categoryName,
          onProgress: setProgress,
          signal: controller.signal,
        });
        onImported?.(result.category.id);
        toast.success(
          t('category_select.import_success').replace(
            '{name}',
            result.category.name,
          ),
        );
        if (result.skippedPhotoCount > 0) {
          toast.error(
            t('category_select.import_partial')
              .replace('{skipped}', String(result.skippedPhotoCount))
              .replace(
                '{total}',
                String(result.photoCount + result.skippedPhotoCount),
              ),
          );
        }
      } catch (e) {
        if (e instanceof ImportCancelledError) {
          // Confirmed, not a failure.
          toast.announce(t('category_select.import_cancelled'));
        } else if (e instanceof ImportFormatError) {
          toast.reportError(
            'import category',
            e,
            t('category_select.import_format_error'),
          );
        } else {
          toast.reportError(
            'import category',
            e,
            t('category_select.import_error'),
          );
        }
      } finally {
        controllerRef.current = null;
        setProgress(null);
      }
    },
    [progress, t, toast, existingCategoryNames],
  );

  const cancelImport = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  // Same beforeunload guard as useExportCategory.tsx, for the same reason.
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
    isImporting: progress !== null,
    message: importProgressMessage(progress, t),
    runImport,
    cancelImport,
  };
}
// Stryker restore all
/* v8 ignore stop */
