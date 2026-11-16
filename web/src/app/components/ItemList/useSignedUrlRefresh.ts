'use client';
import { useEffect, type RefObject } from 'react';

import { itemsDueForResigning } from './imageEntries';
import type { ImageEntry } from './types';

// Re-signs each shown photograph before its own 1h signature expires, so a long-lived tab keeps its thumbnails.
export function useSignedUrlRefresh(
  imagesRef: RefObject<Record<string, ImageEntry[]>>,
  refreshAllImages: (itemIds: string[]) => Promise<void>,
) {
  useEffect(() => {
    const maybeRefresh = () => {
      void refreshAllImages(
        itemsDueForResigning(imagesRef.current, Date.now()),
      );
    };
    const interval = setInterval(maybeRefresh, 60_000);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [imagesRef, refreshAllImages]);
}
