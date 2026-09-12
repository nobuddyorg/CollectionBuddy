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
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
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

/** Disabled, not absent, for a shared category: exportCategory() resolves
 *  the *caller's own* uid to build each item's storage prefix, which for a
 *  grantee is the wrong prefix entirely, not the owner's. */
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
