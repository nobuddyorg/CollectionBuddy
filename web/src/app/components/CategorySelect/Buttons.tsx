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

export function SetButton({
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
      className="min-h-11 px-4 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 transition-opacity"
      title={label}
    >
      {label}
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
      onClick={onClick}
      className="rounded-sm w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
