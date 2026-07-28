import type React from 'react';

export type CenteredModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  closeLabel?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** 'full' fills the viewport -- used by the map, where screen area is
   *  the whole point. Defaults to a centred, width-capped panel. */
  size?: 'default' | 'full';
};
