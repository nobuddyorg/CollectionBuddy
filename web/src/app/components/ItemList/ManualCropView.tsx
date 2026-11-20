'use client';

import { useRef } from 'react';

import type { Translate } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import type { Box } from '../../lib/cutoutImage';
import {
  ARROW_SHIFTS,
  keyStep,
  type Corner,
  type Shift,
} from '../../lib/manualCropFrame';
import type { ImageEntry } from './types';
import type { ManualCrop, ManualCropApi } from './useManualCrop';

type Framing = Extract<ManualCrop, { kind: 'framing' }>;
type Target = 'frame' | Corner;

/** A drag under way: what it grips, where it began, the frame then, and photo pixels per screen pixel. */
type Drag = { target: Target; start: Shift; from: Box; scale: Shift };

const CORNERS: {
  corner: Corner;
  label: (t: Translate) => string;
  place: string;
  cursor: string;
}[] = [
  {
    corner: 'top-left',
    label: (t) => t('item_list.crop_handle_top_left'),
    place: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2',
    cursor: 'cursor-nwse-resize',
  },
  {
    corner: 'top-right',
    label: (t) => t('item_list.crop_handle_top_right'),
    place: 'right-0 top-0 translate-x-1/2 -translate-y-1/2',
    cursor: 'cursor-nesw-resize',
  },
  {
    corner: 'bottom-left',
    label: (t) => t('item_list.crop_handle_bottom_left'),
    place: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
    cursor: 'cursor-nesw-resize',
  },
  {
    corner: 'bottom-right',
    label: (t) => t('item_list.crop_handle_bottom_right'),
    place: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
    cursor: 'cursor-nwse-resize',
  },
];

const share = (value: number, of: number) => `${(100 * value) / of}%`;

const TARGETS: readonly Target[] = [
  'frame',
  ...CORNERS.map(({ corner }) => corner),
];

/** What a grip drags, as its `data-grip` says: read when the event fires, never during render. */
function targetOf(element: HTMLElement): Target {
  const grip = TARGETS.find((target) => target === element.dataset.grip);
  if (!grip) throw new Error(`Not a crop grip: ${element.dataset.grip}`);
  return grip;
}

/** The stored photo with a frame over it to drag, and its corners to resize: the crop shows as the undimmed part. */
export function ManualCropView({
  image,
  alt,
  crop,
  actions,
  backdropClass,
}: {
  image: ImageEntry;
  alt: string;
  crop: Framing;
  actions: Pick<ManualCropApi, 'move' | 'resize'>;
  backdropClass: string;
}) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const { size, frame } = crop;

  const apply = (target: Target, from: Box, by: Shift) => {
    if (target === 'frame') actions.move(from, by);
    else actions.resize(from, target, by);
  };

  const begin = (event: React.PointerEvent<HTMLElement>) => {
    const target = targetOf(event.currentTarget);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const area = areaRef.current!.getBoundingClientRect();
    drag.current = {
      target,
      start: { x: event.clientX, y: event.clientY },
      from: frame,
      scale: { x: size.width / area.width, y: size.height / area.height },
    };
  };

  const follow = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    apply(current.target, current.from, {
      x: (event.clientX - current.start.x) * current.scale.x,
      y: (event.clientY - current.start.y) * current.scale.y,
    });
  };

  const end = () => {
    drag.current = null;
  };

  const press = (event: React.KeyboardEvent<HTMLElement>) => {
    const unit = ARROW_SHIFTS[event.key];
    if (!unit) return;
    event.preventDefault();
    const step = keyStep(size, event.shiftKey);
    apply(targetOf(event.currentTarget), frame, {
      x: unit.x * step,
      y: unit.y * step,
    });
  };

  const placed = {
    left: share(frame.x, size.width),
    top: share(frame.y, size.height),
    width: share(frame.width, size.width),
    height: share(frame.height, size.height),
  };

  return (
    <div
      ref={areaRef}
      data-testid="manual-crop"
      // Stored proportions, fitted by container units and never enlarged, as the rotation preview is.
      style={{
        width: `min(100cqw, ${(100 * size.width) / size.height}cqh, ${size.width}px)`,
        aspectRatio: `${size.width} / ${size.height}`,
      }}
      className={`relative touch-none select-none rounded-sm shadow-lg ${backdropClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the static export is unoptimized */}
      <img
        src={image.urlFull}
        alt={alt}
        crossOrigin="anonymous"
        draggable={false}
        className="h-full w-full rounded-sm"
      />
      {/* Clipped to the photo, so the dimming outside the frame stops at its edge. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm">
        <div
          style={placed}
          className="absolute shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
        />
      </div>
      <div style={placed} className="absolute">
        <button
          type="button"
          data-testid="crop-frame"
          aria-label={t('item_list.crop_frame_move')}
          className="absolute inset-0 cursor-move border-2 border-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
          data-grip="frame"
          onPointerDown={begin}
          onPointerMove={follow}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={press}
        />
        {CORNERS.map(({ corner, label, place, cursor }) => (
          <button
            key={corner}
            type="button"
            data-testid={`crop-handle-${corner}`}
            aria-label={label(t)}
            // A 44px reach around a small visible square: a finger finds it on a phone.
            className={`absolute ${place} ${cursor} flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white`}
            data-grip={corner}
            onPointerDown={begin}
            onPointerMove={follow}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={press}
          >
            <span className="h-4 w-4 rounded-sm border-2 border-white bg-neutral-900/70" />
          </button>
        ))}
      </div>
    </div>
  );
}
