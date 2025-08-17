import type React from 'react';

export type CenteredModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  closeLabel?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
};
