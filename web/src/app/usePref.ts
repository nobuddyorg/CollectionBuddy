'use client';

import { useEffect, useState } from 'react';

export function usePref(key: string, initial: boolean) {
  const [v, setV] = useState<boolean>(initial);
  useEffect(() => {
    try {
      const s =
        typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (s === '1') setV(true);
      if (s === '0') setV(false);
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem(key, v ? '1' : '0');
    } catch {}
  }, [key, v]);
  return [v, setV] as const;
}
