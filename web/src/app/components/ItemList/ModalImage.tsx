'use client';

import { useRef } from 'react';
import Image from 'next/image';
import ReactDOM from 'react-dom';

import { useI18n } from '../../i18n/useI18n';
import { useEscapeToClose } from '../CenteredModal/useEscapeToClose';
import { useFocusTrap } from '../CenteredModal/useFocusTrap';
import { useInertBackground } from '../CenteredModal/useInertBackground';
import { useLockBodyScroll } from '../CenteredModal/useLockBodyScroll';
import Icon, { IconType } from '../Icon';

export function ModalImage({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const open = !!url;
  const panelRef = useRef<HTMLDivElement>(null);

  useLockBodyScroll(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, panelRef);
  useInertBackground(open);

  if (!url || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('item_list.full_size_image_alt')}
      className="fixed inset-0 z-modal bg-background/95 backdrop-blur"
      onClick={onClose}
    >
      {/* Pinned to the corner, not stacked under the image: with the image
          free to take max-h-full, a button below it landed past the bottom
          of a fixed, unscrollable overlay and could not be reached. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 w-11 h-11 flex items-center justify-center rounded-sm bg-card text-card-foreground ring-1 ring-control-border shadow-sm hover:bg-muted transition-colors"
        title={t('item_list.close_modal')}
        aria-label={t('item_list.close_modal')}
      >
        <Icon
          icon={IconType.Close}
          className="w-5 h-5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </button>

      <div className="absolute inset-0 flex items-center justify-center p-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Image
          src={url}
          alt={t('item_list.full_size_image_alt')}
          unoptimized
          // Same reasoning as the grid: see the note in ImageGrid.tsx.
          crossOrigin="anonymous"
          width={0}
          height={0}
          sizes="100vw"
          className="w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg"
        />
      </div>
    </div>,
    document.body,
  );
}
