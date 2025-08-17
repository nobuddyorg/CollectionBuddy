'use client';

import Icon, { IconType } from '../Icon/index';

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
      title={label}
    >
      {isCreating ? (
        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        '+'
      )}
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
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110"
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
        strokeLinejoin="round"
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
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
