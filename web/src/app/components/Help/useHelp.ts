'use client';

import { useEffect, useState } from 'react';

import { isHelpShortcut } from './helpShortcut';

export function useHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isHelpShortcut(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen, show: () => setOpen(true) };
}
