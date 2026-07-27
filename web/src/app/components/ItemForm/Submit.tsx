'use client';

import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

export function Submit({
  submitting,
  disabled,
  label,
  iconMode,
}: {
  submitting: boolean;
  disabled: boolean;
  label: string;
  iconMode: boolean;
}) {
  if (iconMode) {
    return (
      <IconButton
        type="submit"
        size="lg"
        disabled={disabled}
        className="active:scale-[0.99] disabled:opacity-60"
        aria-label={label}
        title={label}
      >
        {submitting ? (
          <Spinner />
        ) : (
          <Icon
            icon={IconType.Plus}
            className="w-6 h-6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        )}
      </IconButton>
    );
  }

  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-9 px-3 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
