'use client';

import { useId, useRef } from 'react';
import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { useFocusTrap } from './useFocusTrap';

export function Dialog({
  title,
  description,
  onClose,
  children,
  initialFocusRef,
  size = 'default',
  role = 'dialog',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  size?: 'default' | 'full';
  role?: 'dialog' | 'alertdialog';
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  // Not a constant id: a confirm raised inside another modal would label the wrong dialog.
  const titleId = useId();
  const descriptionId = useId();

  // Mounted only while open: CenteredModal renders nothing when closed.
  useFocusTrap({ open: true, containerRef: panelRef, initialFocusRef });

  return (
    <div
      className={`fixed inset-0 z-modal flex items-center justify-center ${
        size === 'full'
          ? 'p-0'
          : 'p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]'
      }`}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- onClick only stops a click inside the panel from reaching the backdrop's close handler */}
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`bg-card text-card-foreground ring-1 ring-border shadow-2xl w-full flex flex-col overflow-hidden ${
          size === 'full'
            ? 'h-[100dvh] max-w-none rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
            : 'max-w-2xl max-h-[90dvh] rounded-sm'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 id={titleId} className="font-display text-base">
            {title}
          </h3>
          <button
            data-testid="dialog-close"
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-card-foreground/10"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon icon={IconType.Close} className="w-5 h-5" />
          </button>
        </div>
        {/* Fullscreen drops the padding, or 100%-sized content (the map) collapses to nothing. */}
        <div
          className={
            size === 'full'
              ? 'flex-1 min-h-0 overflow-hidden'
              : 'p-4 overflow-auto'
          }
        >
          {description && (
            <p
              id={descriptionId}
              data-testid="dialog-message"
              className="text-sm mb-3"
            >
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
