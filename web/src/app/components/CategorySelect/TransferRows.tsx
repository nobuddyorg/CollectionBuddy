'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';

import { useI18n } from '../../i18n/useI18n';
import {
  CancelExportButton,
  CancelImportButton,
  ExportButton,
  ImportButton,
} from './Buttons';
import { labelClasses } from '../ui/labelClasses';

function TransferRow({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
      {children}
      <p aria-live="polite" className={labelClasses('min-w-0 flex-1')}>
        {message}
      </p>
    </div>
  );
}

export function ImportRow({
  isImporting,
  message,
  onFile,
  onCancel,
}: {
  isImporting: boolean;
  message: string | null;
  onFile: (file: File) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <TransferRow message={message ?? t('category_select.import_hint')}>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        data-testid="import-file-input"
        className="sr-only"
        aria-label={t('category_select.import')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      <ImportButton
        onClick={() => inputRef.current?.click()}
        disabled={isImporting}
        isImporting={isImporting}
        label={t('category_select.import')}
      />
      {isImporting && (
        <CancelImportButton
          onClick={onCancel}
          label={t('category_select.import_cancel')}
        />
      )}
    </TransferRow>
  );
}

/** Disabled for a shared category: exportCategory() builds storage paths from the caller's uid, not the owner's. */
export function ExportRow({
  isExporting,
  isShared,
  message,
  onExport,
  onCancel,
}: {
  isExporting: boolean;
  isShared: boolean;
  message: string | null;
  onExport: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <TransferRow message={message ?? t('category_select.export_hint')}>
      <ExportButton
        onClick={onExport}
        disabled={isExporting || isShared}
        isExporting={isExporting}
        label={t('category_select.export')}
      />
      {isExporting && (
        <CancelExportButton
          onClick={onCancel}
          label={t('category_select.export_cancel')}
        />
      )}
    </TransferRow>
  );
}
