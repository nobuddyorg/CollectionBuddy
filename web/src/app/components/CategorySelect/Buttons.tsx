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
  // Icon-only: a text label crowded the field to a sliver at phone width; aria-label says the name.
  return (
    <IconButton
      variant="primary"
      size="xl"
      data-testid="add-category"
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
      data-testid="rename-category"
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
      // Same height as the field and rename button beside it.
      size="xl"
      data-testid="delete-category"
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

function RoundIconButton({
  testId,
  onClick,
  label,
  icon,
  iconClassName,
  boxClassName,
  strokeLinecap,
}: {
  testId: string;
  onClick: () => void;
  label: string;
  icon: IconType;
  iconClassName: string;
  boxClassName: string;
  strokeLinecap?: 'round';
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`rounded-sm ${boxClassName} shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors`}
      aria-label={label}
      title={label}
    >
      <Icon
        icon={icon}
        className={iconClassName}
        aria-hidden="true"
        // Spread only when set: an explicit undefined would override Icon's own strokeLinecap default.
        {...(strokeLinecap ? { strokeLinecap } : {})}
      />
    </button>
  );
}

// Sizes down at sm, unlike CANCEL_BOX: the header's neighbours do too.
const HEADER_TOGGLE_BOX = 'w-11 h-11 sm:w-9 sm:h-9';

// Same box as ExpandButton, so the toggle does not move between open and closed.
export function CollapseButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <RoundIconButton
      testId="collapse-categories"
      onClick={onClick}
      label={label}
      icon={IconType.Close}
      iconClassName="w-5 h-5"
      boxClassName={HEADER_TOGGLE_BOX}
      // Close's own default draws a square cap.
      strokeLinecap="round"
    />
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
    <RoundIconButton
      testId="expand-categories"
      onClick={onClick}
      label={label}
      icon={IconType.Edit}
      iconClassName="w-5 h-5"
      boxClassName={HEADER_TOGGLE_BOX}
    />
  );
}

// Fixed, unlike HEADER_TOGGLE_BOX: sits inline with a status line that has no room to grow at sm.
const CANCEL_BOX = 'w-9 h-9';

export function CancelExportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <RoundIconButton
      testId="cancel-export"
      onClick={onClick}
      label={label}
      icon={IconType.Close}
      iconClassName="w-4 h-4"
      boxClassName={CANCEL_BOX}
      strokeLinecap="round"
    />
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
    <RoundIconButton
      testId="cancel-import"
      onClick={onClick}
      label={label}
      icon={IconType.Close}
      iconClassName="w-4 h-4"
      boxClassName={CANCEL_BOX}
      strokeLinecap="round"
    />
  );
}

function LabeledActionButton({
  testId,
  onClick,
  disabled,
  busy,
  icon,
  label,
}: {
  testId: string;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  icon: IconType;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className="min-h-11 px-4 shrink-0 rounded-sm font-label text-xs ring-1 ring-inset ring-control-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center justify-center gap-2"
      title={label}
    >
      {busy ? (
        <Spinner size="sm" />
      ) : (
        <Icon icon={icon} className="w-4 h-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

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
    <LabeledActionButton
      testId="export-category"
      onClick={onClick}
      disabled={disabled}
      busy={isExporting}
      icon={IconType.Download}
      label={label}
    />
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
    <LabeledActionButton
      testId="import-category"
      onClick={onClick}
      disabled={disabled}
      busy={isImporting}
      icon={IconType.Upload}
      label={label}
    />
  );
}
