'use client';

import { useTopmostKeydown } from './useTopmostKeydown';

export function useEscapeToClose(enabled: boolean, onClose: () => void) {
  useTopmostKeydown(enabled, (event) => {
    if (event.key === 'Escape') onClose();
  });
}
