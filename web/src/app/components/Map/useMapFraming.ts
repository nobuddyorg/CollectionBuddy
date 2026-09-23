'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MapCommand, MapCommandKind } from './types';

// Counter-based rather than withdrawn and reissued, so a repeat still reads as a change to the map.
const nextCommand =
  (kind: MapCommandKind) =>
  (previous: MapCommand | null): MapCommand => ({
    kind,
    id: (previous?.id ?? 0) + 1,
  });

/** Arbitrates framing: the latest tap wins, and the automatic re-frame never overrides a "zoom to me". */
export function useMapFraming(open: boolean) {
  const [command, setCommand] = useState<MapCommand | null>(null);
  const latestTap = useRef<{ kind: MapCommandKind } | null>(null);

  useEffect(() => {
    latestTap.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a command left standing would re-run on the next open
    setCommand(null);
  }, [open]);

  /** Records a tap for `kind`; the returned function frames it unless a later tap or a close came first. */
  const tap = useCallback((kind: MapCommandKind) => {
    const thisTap = { kind };
    latestTap.current = thisTap;
    return () => {
      if (latestTap.current === thisTap) setCommand(nextCommand(kind));
    };
  }, []);

  const frameAllAutomatically = useCallback(() => {
    if (latestTap.current?.kind === 'fitCurrent') return;
    setCommand(nextCommand('fitAll'));
  }, []);

  return { command, tap, frameAllAutomatically };
}
