'use client';

import { Backdrop } from './Backdrop';
import { Dialog } from './Dialog';
import { Portal } from './Portal';
import type { CenteredModalProps } from './types';
import { useEscapeToClose } from './useEscapeToClose';
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
}: CenteredModalProps) {
  useLockBodyScroll(open);
  useEscapeToClose(open && closeOnEsc, () => onOpenChange(false));

  if (typeof document === 'undefined') return null;

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
      >
        {children}
      </Dialog>
    </Portal>
  );
}
