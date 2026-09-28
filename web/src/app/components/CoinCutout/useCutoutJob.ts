'use client';

import { useEffect, useState } from 'react';
import {
  cutOutCoin,
  NoCoinFoundError,
  type CoinCutout,
  type CutoutProgress,
} from '../../lib/coinCutout';

export type CutoutJob =
  | { status: 'starting' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'analyzing' }
  | { status: 'done'; cutout: CoinCutout }
  | { status: 'no-coin' }
  | { status: 'failed' };

function jobFor(progress: CutoutProgress): CutoutJob {
  if (progress.stage === 'download') {
    const { loaded, total } = progress;
    return { status: 'downloading', loaded, total };
  }
  return { status: 'analyzing' };
}

/** Cuts the coin out of `file` for as long as the review shows it; closing the review stops the worker. */
export function useCutoutJob(file: File): CutoutJob {
  const [job, setJob] = useState<CutoutJob>({ status: 'starting' });

  useEffect(() => {
    const controller = new AbortController();
    cutOutCoin(file, {
      signal: controller.signal,
      onProgress: (progress) => setJob(jobFor(progress)),
    }).then(
      (cutout) => setJob({ status: 'done', cutout }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof NoCoinFoundError) {
          setJob({ status: 'no-coin' });
          return;
        }
        console.error('Coin cut-out failed', error);
        setJob({ status: 'failed' });
      },
    );
    return () => controller.abort();
  }, [file]);

  return job;
}
