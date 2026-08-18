import type React from 'react';

export type CenteredModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  /** Rendered above the modal's own content and wired to `aria-describedby`,
   *  for content that isn't just the dialog's label (e.g. a confirm's
   *  question). */
  description?: string;
  closeLabel?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** 'full' fills the viewport -- used by the map, where screen area is
   *  the whole point. Defaults to a centred, width-capped panel. */
  size?: 'default' | 'full';
  /** 'alertdialog' announces the dialog as an interruption requiring a
   *  response -- use it for confirms, not general forms. */
  role?: 'dialog' | 'alertdialog';
};
