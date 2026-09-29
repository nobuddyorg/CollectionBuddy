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
  description,
  children,
  closeOnBackdrop = true,
  initialFocusRef,
  size = 'default',
  role = 'dialog',
}: CenteredModalProps) {
  const close = () => onOpenChange(false);
  useLockBodyScroll(open);
  useEscapeToClose(open, close);
  useInertBackground(open);

  if (!open) return null;

  return (
    <Portal>
      <Backdrop onClick={closeOnBackdrop ? close : undefined} />
      <Dialog
        title={title}
        description={description}
        onClose={close}
        initialFocusRef={initialFocusRef}
        size={size}
        role={role}
      >
        {children}
      </Dialog>
    </Portal>
  );
}
