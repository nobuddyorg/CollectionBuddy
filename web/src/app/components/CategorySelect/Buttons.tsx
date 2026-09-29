'use client';

import type { Ref } from 'react';

import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import type { IconButtonVariant } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

// xl, so it stands as tall as the text field beside it.
export function FieldIconButton({
  testId,
  variant,
  icon,
  label,
  onClick,
  disabled,
  busy,
  className = '',
}: {
  testId: string;
  variant: IconButtonVariant;
  icon: IconType;
  label: string;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <IconButton
      variant={variant}
      size="xl"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      aria-label={label}
      title={label}
      className={className}
    >
      {busy ? (
        <Spinner size="sm" />
      ) : (
        <Icon icon={icon} className="w-5 h-5" aria-hidden="true" />
      )}
    </IconButton>
  );
}

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
  // Icon-only: a text label leaves the field no room at phone width.
  return (
    <FieldIconButton
      testId="add-category"
      variant="primary"
      icon={IconType.Plus}
      label={label}
      onClick={onClick}
      disabled={disabled}
      busy={isCreating}
    />
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
    <FieldIconButton
      testId="rename-category"
      variant="outline"
      icon={IconType.Check}
      label={label}
      onClick={onClick}
      disabled={disabled}
      className="disabled:opacity-40"
    />
  );
}

export function RemoveCategoryButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <FieldIconButton
      testId="delete-category"
      variant="destructive"
      icon={IconType.Trash}
      label={label}
      onClick={onClick}
      disabled={disabled}
      className="disabled:opacity-50"
    />
  );
}

const GHOST_TONE_CLASSES = {
  neutral: 'hover:text-foreground hover:bg-muted',
  destructive: 'hover:bg-destructive/10 hover:text-destructive',
} as const;

export function GhostIconButton({
  testId,
  onClick,
  label,
  icon,
  iconClassName,
  boxClassName,
  strokeLinecap,
  disabled,
  className = '',
  tone = 'neutral',
  ref,
}: {
  testId: string;
  onClick: () => void;
  label: string;
  icon: IconType;
  iconClassName: string;
  boxClassName: string;
  strokeLinecap?: 'round';
  disabled?: boolean;
  className?: string;
  tone?: keyof typeof GHOST_TONE_CLASSES;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm ${boxClassName} shrink-0 flex items-center justify-center text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-40 ${GHOST_TONE_CLASSES[tone]} ${className}`}
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

// A 44px touch target that shrinks to 36px at sm, as its neighbours do, unlike CANCEL_BOX.
export const TOUCH_ICON_BOX = 'w-11 h-11 sm:w-9 sm:h-9';

// Same box as ExpandButton, so the toggle does not move between open and closed.
export function CollapseButton({
  onClick,
  label,
  ref,
}: {
  onClick: () => void;
  label: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <GhostIconButton
      ref={ref}
      testId="collapse-categories"
      onClick={onClick}
      label={label}
      icon={IconType.Close}
      iconClassName="w-5 h-5"
      boxClassName={TOUCH_ICON_BOX}
      // Close's own default draws a square cap.
      strokeLinecap="round"
    />
  );
}

export function ExpandButton({
  onClick,
  label,
  ref,
}: {
  onClick: () => void;
  label: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <GhostIconButton
      ref={ref}
      testId="expand-categories"
      onClick={onClick}
      label={label}
      icon={IconType.Edit}
      iconClassName="w-5 h-5"
      boxClassName={TOUCH_ICON_BOX}
    />
  );
}

// Fixed, unlike TOUCH_ICON_BOX: sits inline with a status line that has no room to grow at sm.
const CANCEL_BOX = 'w-9 h-9';

export function CancelExportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <GhostIconButton
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
    <GhostIconButton
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
