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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-3 py-1.5 bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      {isCreating ? <Spinner size="sm" /> : '+'}
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
    <IconButton size="sm" onClick={onClick} aria-label={label} title={label}>
      <Icon
        icon={IconType.Check}
        className="w-5 h-5"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      className="rounded-xl w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-primary text-primary-foreground shadow-sm hover:brightness-110"
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
