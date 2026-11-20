'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import type { ImageEntry } from './types';

/** What each tool does to the shown photo; the viewer decides which are open to whom. */
export type ToolActions = {
  delete: (image: ImageEntry) => void;
  removeBackground: (image: ImageEntry) => void;
  rotate: (image: ImageEntry) => void;
  makeCover: (image: ImageEntry) => void;
  cropToItem: (image: ImageEntry) => void;
  cropByHand: (image: ImageEntry) => void;
};

/** An editor's tools for the shown photo, top left: delete, the edits, and making it the cover. */
export function ViewerTools({
  image,
  actions,
  offerRemoveBackground,
  isCover,
  disabled,
  photoShown,
}: {
  image: ImageEntry;
  actions: ToolActions;
  /** The two tools that need background removal's model, opted in to on this browser. */
  offerRemoveBackground: boolean;
  /** The cover is the first photo; it cannot be made the cover again. */
  isCover: boolean;
  disabled: boolean;
  /** A hand-drawn crop is drawn over the photo, so it waits until the photo has loaded. */
  photoShown: boolean;
}) {
  const { t } = useI18n();
  const tool = ({
    testId,
    label,
    icon,
    run,
    waiting = false,
  }: {
    testId: string;
    label: string;
    icon: IconType;
    run: (image: ImageEntry) => void;
    /** Shown, but not yet usable. */
    waiting?: boolean;
  }) => (
    <button
      data-testid={testId}
      onClick={() => run(image)}
      disabled={disabled || waiting}
      className={TOOL_CLASSES}
      title={label}
      aria-label={label}
    >
      <Icon icon={icon} className="w-5 h-5" />
    </button>
  );

  return (
    <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10 flex gap-1">
      {/* The only delete control for photographs past the strip; trash, not a second X beside Close. */}
      {tool({
        testId: 'delete-image',
        label: t('item_list.delete_image'),
        icon: IconType.Trash,
        run: actions.delete,
      })}
      {offerRemoveBackground &&
        tool({
          testId: 'remove-background-image',
          label: t('item_list.remove_background'),
          icon: IconType.Scissors,
          run: actions.removeBackground,
        })}
      {tool({
        testId: 'rotate-image',
        label: t('item_list.rotate'),
        icon: IconType.RotateRight,
        run: actions.rotate,
      })}
      {!isCover &&
        tool({
          testId: 'make-cover',
          label: t('item_list.make_cover'),
          icon: IconType.Star,
          run: actions.makeCover,
        })}
      {offerRemoveBackground &&
        tool({
          testId: 'crop-image',
          label: t('item_list.crop'),
          icon: IconType.Crop,
          run: actions.cropToItem,
        })}
      {tool({
        testId: 'crop-by-hand',
        label: t('item_list.crop_by_hand'),
        icon: IconType.CropFrame,
        run: actions.cropByHand,
        waiting: !photoShown,
      })}
    </div>
  );
}

const TOOL_CLASSES =
  'w-11 h-11 flex items-center justify-center rounded-sm text-foreground hover:bg-muted disabled:opacity-60 transition-colors';
