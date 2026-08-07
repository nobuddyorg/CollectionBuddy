'use client';

import { Backdrop } from './Backdrop';
import { Dialog } from './Dialog';
import { Portal } from './Portal';
import type { CenteredModalProps } from './types';
import { useEscapeToClose } from './useEscapeToClose';
import { useInertBackground } from './useInertBackground';
import { useLockBodyScroll } from './useLockBodyScroll';

export default function CenteredModal({
  open,
  onOpenChange,
  title,
  closeLabel = 'Close',
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  initialFocusRef,
  size = 'default',
}: CenteredModalProps) {
  useLockBodyScroll(open);
  useEscapeToClose(open && closeOnEsc, () => onOpenChange(false));
  useInertBackground(open);

  if (typeof document === 'undefined' || !open) return null;

  return (
    <Portal>
      <Backdrop
        open={open}
        onClick={closeOnBackdrop ? () => onOpenChange(false) : undefined}
      />
      <Dialog
        open={open}
        title={title}
        closeLabel={closeLabel}
        onClose={() => onOpenChange(false)}
        initialFocusRef={initialFocusRef}
        size={size}
      >
        {children}
      </Dialog>
    </Portal>
  );
}
