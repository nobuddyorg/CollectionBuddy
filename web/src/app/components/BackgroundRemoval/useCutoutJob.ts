'use client';

import { useEffect, useState } from 'react';
import {
  removeBackground,
  NoObjectFoundError,
  type Cutout,
  type CutoutProgress,
} from '../../lib/backgroundRemoval';

export type CutoutJob =
  | { status: 'starting' }
  | { status: 'downloading'; loaded: number; total: number }
  | { status: 'analyzing' }
  | { status: 'done'; cutout: Cutout }
  | { status: 'no-object' }
  | { status: 'failed' };

function jobFor(progress: CutoutProgress): CutoutJob {
  if (progress.stage === 'download') {
    const { loaded, total } = progress;
    return { status: 'downloading', loaded, total };
  }
  return { status: 'analyzing' };
}

/** Removes the background of `file` for as long as the review shows it; closing the review stops the worker. */
export function useCutoutJob(file: File): CutoutJob {
  const [job, setJob] = useState<CutoutJob>({ status: 'starting' });

  useEffect(() => {
    const controller = new AbortController();
    removeBackground(file, {
      signal: controller.signal,
      onProgress: (progress) => setJob(jobFor(progress)),
    }).then(
      (cutout) => setJob({ status: 'done', cutout }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof NoObjectFoundError) {
          setJob({ status: 'no-object' });
          return;
        }
        console.error('Background removal failed', error);
        setJob({ status: 'failed' });
      },
    );
    return () => controller.abort();
  }, [file]);

  return job;
}
