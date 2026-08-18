'use client';

import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

export function AddButton({
  onClick,
  disabled,
  isCreating,
  label,
  className = '',
}: {
  onClick: () => void;
  disabled: boolean;
  isCreating: boolean;
  label: string;
  className?: string;
}) {
  // Icon-only: a spelled-out label on both the rename and add rows crowded
  // the field down to a sliver on a phone-width panel. The name is still
  // said, via aria-label/title.
  return (
    <IconButton
      variant="primary"
      size="xl"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isCreating}
      aria-label={label}
      title={label}
      className={className}
    >
      {isCreating ? (
        <Spinner size="sm" />
      ) : (
        <Icon icon={IconType.Plus} className="w-5 h-5" aria-hidden="true" />
      )}
    </IconButton>
  );
}

export function RenameButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <IconButton
      variant="outline"
      size="xl"
      onClick={onClick}
      disabled={disabled}
      className="disabled:opacity-40"
      aria-label={label}
      title={label}
    >
      <Icon icon={IconType.Check} className="w-5 h-5" aria-hidden="true" />
    </IconButton>
  );
}

// Pairs with ExpandButton: drawn to the same box so the toggle's position
// doesn't move between open and closed.
export function CollapseButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      // Named for the end-to-end suite: an icon button whose only label is
      // translated.
      data-testid="collapse-categories"
      onClick={onClick}
      className="rounded-sm w-11 h-11 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon
        icon={IconType.Close}
        className="w-5 h-5"
        aria-hidden="true"
        // Trailing override: Close's own default draws a square cap.
        strokeLinecap="round"
      />
    </button>
  );
}

export function DeleteButtonWithLabel({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <IconButton
      variant="destructive"
      // Drawn to the same height as the field and rename button it stands
      // beside.
      size="xl"
      onClick={onClick}
      disabled={disabled}
      className="disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <Icon icon={IconType.Trash} className="w-5 h-5" aria-hidden="true" />
    </IconButton>
  );
}

// Full width, under its own rule, away from Delete: a thumb slip between
// Export and Delete would be destructive, not just inconvenient.
export function ExportButton({
  onClick,
  disabled,
  isExporting,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  isExporting: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid="export-category"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isExporting}
      className="min-h-11 px-4 shrink-0 rounded-sm font-label text-xs ring-1 ring-inset ring-control-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center justify-center gap-2"
      title={label}
    >
      {isExporting ? (
        <Spinner size="sm" />
      ) : (
        <Icon icon={IconType.Download} className="w-4 h-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

// Shown only while an export is running -- the one action available for a
// run that can take minutes.
export function CancelExportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid="cancel-export"
      onClick={onClick}
      className="rounded-sm w-9 h-9 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon
        icon={IconType.Close}
        className="w-4 h-4"
        aria-hidden="true"
        // Trailing override: Close's own default draws a square cap.
        strokeLinecap="round"
      />
    </button>
  );
}

export function ImportButton({
  onClick,
  disabled,
  isImporting,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  isImporting: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid="import-category"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isImporting}
      className="min-h-11 px-4 shrink-0 rounded-sm font-label text-xs ring-1 ring-inset ring-control-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center justify-center gap-2"
      title={label}
    >
      {isImporting ? (
        <Spinner size="sm" />
      ) : (
        <Icon icon={IconType.Upload} className="w-4 h-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

export function CancelImportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid="cancel-import"
      onClick={onClick}
      className="rounded-sm w-9 h-9 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon
        icon={IconType.Close}
        className="w-4 h-4"
        aria-hidden="true"
        // Trailing override: Close's own default draws a square cap.
        strokeLinecap="round"
      />
    </button>
  );
}

export function ExpandButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid="expand-categories"
      onClick={onClick}
      className="rounded-sm w-11 h-11 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon icon={IconType.Edit} className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
