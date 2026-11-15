import { fitFor, previewLayout, totalDegrees } from '../../lib/rotation';
import type { ImageEntry } from './types';
import type { RotationDraft } from './useRotationDraft';

/** The photo the viewer last finished loading, at its stored size. */
export type Shown = { path: string; width: number; height: number };

type Editing = Extract<RotationDraft, { kind: 'editing' }>;

/** The live preview's frame and photo: stored proportions, fitted by container units, never enlarged. */
function previewStyles(draft: Editing, shown: Shown) {
  const transparent =
    draft.inspection.kind === 'ready' &&
    draft.inspection.inspection.transparent;
  // Shown whole until the photo is read: only then is it known to be a cut-out or to crop.
  const fit = draft.inspection.kind === 'ready' ? fitFor(transparent) : 'whole';
  const degrees = totalDegrees(draft.rotation);
  const { frame, photoShare } = previewLayout({ photo: shown, degrees, fit });
  return {
    transparent,
    frame: {
      width: `min(100cqw, ${(100 * frame.width) / frame.height}cqh, ${frame.width}px)`,
      aspectRatio: `${frame.width} / ${frame.height}`,
    },
    photo: {
      width: `${100 * photoShare.width}%`,
      height: `${100 * photoShare.height}%`,
      transform: `translate(-50%, -50%) rotate(${degrees}deg)`,
    },
  };
}

/** The shown photo, or its rotation's live preview: the stored result's frame, the photo turned inside it. */
export function ViewerPhoto({
  image,
  alt,
  draft,
  shown,
  backdropClass,
  onLoad,
  onClick,
}: {
  image: ImageEntry;
  alt: string;
  draft: RotationDraft;
  shown: Shown;
  /** The chosen backdrop behind a cut-out's see-through background; not behind a failed photo's alt text. */
  backdropClass: string;
  onLoad: (photo: HTMLImageElement) => void;
  onClick: () => void;
}) {
  const loaded = shown.path === image.pathFull;
  const preview =
    draft.kind === 'editing' && loaded
      ? previewStyles(draft, shown)
      : undefined;
  const fitted = `w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg ${loaded ? backdropClass : ''}`;
  const photo = (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the static export is unoptimized, and tap-to-close is pointer-only: the Close button and Escape cover the keyboard
    <img
      data-testid="viewer-photo"
      src={image.urlFull}
      alt={alt}
      decoding="async"
      // Same reasoning as the grid: see the note in ImageGrid.tsx.
      crossOrigin="anonymous"
      onLoad={(event) => onLoad(event.currentTarget)}
      style={preview?.photo}
      className={preview ? 'absolute left-1/2 top-1/2 max-w-none' : fitted}
      onClick={onClick}
    />
  );
  if (!preview) return photo;
  return (
    <div
      data-testid="rotation-preview"
      style={preview.frame}
      // A cut-out's corners stay see-through, so the chosen backdrop shows there too.
      className={`relative overflow-hidden rounded-sm shadow-lg ${
        preview.transparent ? backdropClass : ''
      }`}
    >
      {photo}
    </div>
  );
}
