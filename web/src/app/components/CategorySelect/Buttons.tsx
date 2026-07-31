'use client';

import Icon, { IconType } from '../Icon/index';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

export function AddButton({
  onClick,
  disabled,
  isCreating,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  isCreating: boolean;
  label: string;
}) {
  // Spelled out rather than a bare "+": a control should say what happens
  // when it is used, and a lone glyph gave no confirmation of that.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isCreating}
      className="min-h-11 px-4 shrink-0 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
      title={label}
    >
      {isCreating && <Spinner size="sm" />}
      {label}
    </button>
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
      size="sm"
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
