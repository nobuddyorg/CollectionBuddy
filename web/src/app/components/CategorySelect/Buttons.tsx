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

// Shared shape for every circular, icon-only, muted-until-hover button below
// (collapse/expand the panel, cancel a running export/import). Each wrapper
// keeps its own name and testid so call sites read the same as before.
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
        // Only spread when set: Icon's `{...props}` sits after each icon's
        // own default `strokeLinecap="round"`, so an *explicit* `undefined`
        // here would override that default to unset rather than leaving it
        // alone the way simply not passing the prop does.
        {...(strokeLinecap ? { strokeLinecap } : {})}
      />
    </button>
  );
}

// Both size down at `sm`, unlike the cancel buttons below: this pair sits in
// the panel's header, at home beside the larger touch targets around it.
const HEADER_TOGGLE_BOX = 'w-11 h-11 sm:w-9 sm:h-9';

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
    <RoundIconButton
      // Named for the end-to-end suite: an icon button whose only label is
      // translated.
      testId="collapse-categories"
      onClick={onClick}
      label={label}
      icon={IconType.Close}
      iconClassName="w-5 h-5"
      boxClassName={HEADER_TOGGLE_BOX}
      // Trailing override: Close's own default draws a square cap.
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

// Fixed size, not responsive like the header toggle above: these sit inline
// with an in-progress row's status text, which never gets the header's own
// room to grow at `sm`.
const CANCEL_BOX = 'w-9 h-9';

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

// Shared shape for ExportButton/ImportButton: a full-width, labeled button
// with an icon that swaps for a spinner while busy.
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
