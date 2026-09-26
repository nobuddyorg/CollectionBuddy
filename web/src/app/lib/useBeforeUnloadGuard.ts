'use client';
import { useEffect } from 'react';

/** While `hasUnsavedWork`, the browser asks before the tab closes, reloads or navigates away. */
export function useBeforeUnloadGuard(hasUnsavedWork: boolean) {
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedWork]);
}
