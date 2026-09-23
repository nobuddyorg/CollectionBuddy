import type React from 'react';

export type CenteredModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  /** Rendered above the content and wired to `aria-describedby`, e.g. a confirm's question. */
  description?: string;
  closeLabel?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** 'full' fills the viewport (the map); default is a centred, width-capped panel. */
  size?: 'default' | 'full';
  /** 'alertdialog' announces an interruption requiring a response: confirms, not forms. */
  role?: 'dialog' | 'alertdialog';
};
