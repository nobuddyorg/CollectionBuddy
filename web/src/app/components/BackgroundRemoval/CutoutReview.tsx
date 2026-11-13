'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';
import type { Sharpness } from '../../lib/photoSharpness';
import { BlurWarning, FRAME, Preview } from './PhotoPreview';
import type { CutoutChoice } from './useBackgroundRemovalUpload';
import { useCutoutJob, type CutoutJob } from './useCutoutJob';

function DownloadProgress({ job }: { job: CutoutJob }) {
  const { t } = useI18n();
  if (job.status !== 'downloading') return null;
  // No total (a compressed response) leaves the bar indeterminate rather than wrong.
  const known = job.total > 0;
  return (
    <progress
      className="w-full accent-primary"
      aria-label={t('background_removal.download_label')}
      value={known ? Math.min(job.loaded, job.total) : undefined}
      max={known ? job.total : undefined}
    />
  );
}

export default function CutoutReview({
  file,
  sharpness,
  onChoose,
}: {
  file: File;
  sharpness: Sharpness | 'checking';
  onChoose: (choice: CutoutChoice) => void;
}) {
  const { t } = useI18n();
  const job = useCutoutJob(file);
  const keepOriginalRef = useRef<HTMLButtonElement>(null);

  // The one choice always open, so Enter never uploads something the person has not seen.
  useEffect(() => {
    keepOriginalRef.current!.focus();
  }, []);

  const status: Record<CutoutJob['status'], string> = {
    starting: t('background_removal.working'),
    downloading: t('background_removal.downloading'),
    analyzing: t('background_removal.working'),
    done: t('background_removal.ready'),
    'no-object': t('background_removal.no_object'),
    failed: t('background_removal.failed'),
  };
  const working = ['starting', 'downloading', 'analyzing'].includes(job.status);

  return (
    <div data-testid="background-removal-review" className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <figure className="space-y-1.5">
          <div className={FRAME}>
            <Preview
              blob={file}
              alt={t('background_removal.original_alt')}
              testId="cutout-original"
            />
          </div>
          <figcaption className="font-label text-xs">
            {t('background_removal.original')}
          </figcaption>
        </figure>
        <figure className="space-y-1.5" aria-busy={working}>
          <div className={FRAME}>
            {job.status === 'done' && (
              <Preview
                blob={job.cutout.blob}
                alt={t('background_removal.cutout_alt')}
                testId="cutout-result"
              />
            )}
            {working && <Spinner size="lg" />}
          </div>
          <figcaption className="font-label text-xs">
            {t('background_removal.cutout')}
          </figcaption>
        </figure>
      </div>

      <p role="status" data-testid="cutout-status" className="text-sm">
        {status[job.status]}
      </p>
      <DownloadProgress job={job} />
      {sharpness === 'blurry' && <BlurWarning />}

      <div className="flex flex-wrap justify-end gap-2">
        {sharpness === 'blurry' && (
          <button
            type="button"
            data-testid="cutout-skip"
            onClick={() => onChoose({ kind: 'skip' })}
            className={buttonClasses()}
          >
            {t('sharpness.skip')}
          </button>
        )}
        <button
          ref={keepOriginalRef}
          type="button"
          data-testid="cutout-keep-original"
          onClick={() => onChoose({ kind: 'original' })}
          className={buttonClasses()}
        >
          {t('background_removal.keep_original')}
        </button>
        <button
          type="button"
          data-testid="cutout-use"
          disabled={job.status !== 'done'}
          onClick={
            job.status === 'done'
              ? () => onChoose({ kind: 'cut-out', blob: job.cutout.blob })
              : undefined
          }
          className={filledButtonClasses(
            'primary',
            'disabled:opacity-40 disabled:cursor-not-allowed transition-opacity',
          )}
        >
          {t('background_removal.use_cutout')}
        </button>
      </div>
    </div>
  );
}
