'use client';

import { useRef } from 'react';
import Image from 'next/image';
import ReactDOM from 'react-dom';

import { useI18n } from '../../i18n/useI18n';
import { useEscapeToClose } from '../CenteredModal/useEscapeToClose';
import { useFocusTrap } from '../CenteredModal/useFocusTrap';
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

  if (!url || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('item_list.full_size_image_alt')}
      className="fixed inset-0 z-modal flex flex-col items-center justify-center bg-background/90 backdrop-blur"
      onClick={onClose}
    >
      <Image
        src={url}
        alt={t('item_list.full_size_image_alt')}
        unoptimized
        width={0}
        height={0}
        sizes="100vw"
        className="w-auto h-auto max-w-full max-h-full object-contain rounded-sm shadow-lg"
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="mt-4 w-10 h-10 flex items-center justify-center rounded-sm bg-card text-card-foreground hover:bg-card/80 transition"
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
    </div>,
    document.body,
  );
}
