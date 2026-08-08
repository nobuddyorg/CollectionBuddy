'use client';

import Icon, { IconType } from '../Icon/index';
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
  // Icon-only, like DeleteButtonWithLabel beside it -- a spelled-out label
  // on both the rename and add rows crowded the field down to a sliver on a
  // phone-width panel; the name is still said, just via aria-label/title
  // rather than on the button's face.
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
  // Icon-only, like AddButton and DeleteButtonWithLabel: a checkmark reads
  // as "commit this edit" beside the field it applies to.
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
      <Icon
        icon={IconType.Check}
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </IconButton>
  );
}

// Closes the category panel. Replaces a "Set" button that re-selected the
// already-selected category and collapsed the panel -- it never set
// anything, so it was named for something it did not do. This pairs with
// ExpandButton: the pencil opens the panel, this closes it from the same
// spot, and the two are drawn to the same box so the spot does not move
// between them.
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
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
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
      // Drawn to the same height as the field and the rename button it
      // stands beside; at `sm` it was a 32px box in a 44px row.
      size="xl"
      onClick={onClick}
      disabled={disabled}
      className="disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <Icon
        icon={IconType.Trash}
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </IconButton>
  );
}

// Full width and quiet, sitting under a rule of its own. Export is not a
// third verb in the rename row: those two edit the category, this one takes
// a copy of it away, and the one thing it must never be is a neighbour of
// Delete that a thumb can miss by 6px.
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

// Sits next to the progress line only while an export is running: the one
// action available for a run that can take minutes, on a connection that
// may never come back on its own (#418).
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
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
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
      <Icon
        icon={IconType.Edit}
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </button>
  );
}
