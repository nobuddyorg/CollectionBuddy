'use client';

import Image from 'next/image';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import ReactDOM from 'react-dom';

export function ModalImage({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!url || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-background/90 backdrop-blur"
      onClick={onClose}
    >
      <Image
        src={url}
        alt={t('item_list.full_size_image_alt')}
        unoptimized
        width={0}
        height={0}
        sizes="100vw"
        className="w-auto h-auto max-w-full max-h-full object-contain rounded-xl shadow-lg"
      />
      <button
        className="mt-4 w-10 h-10 flex items-center justify-center rounded-xl bg-card text-card-foreground hover:bg-card/80 transition"
        title={t('item_list.close_modal')}
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
