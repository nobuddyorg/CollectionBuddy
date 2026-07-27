'use client';

import Icon, { IconType } from '../Icon';

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
      <button
        type="submit"
        disabled={disabled}
        className="w-10 h-10 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center"
        aria-label={label}
        title={label}
      >
        {submitting ? (
          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <Icon
            icon={IconType.Plus}
            className="w-6 h-6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        )}
      </button>
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
