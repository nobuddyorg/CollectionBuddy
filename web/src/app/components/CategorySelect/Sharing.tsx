'use client';

import { useI18n } from '../../i18n/useI18n';
import { ShareInvite } from './ShareInvite';
import { ShareList } from './ShareList';
import type { UseShares } from './useShares';
import { labelClasses } from '../ui/labelClasses';

type Props = {
  shares: UseShares;
};

// Mounted only for a category the viewer owns; a grantee's own grant ends via Delete (onLeave).
export function SharingSection({ shares }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className={labelClasses()}>
        {t('category_select.share_section_title')}
      </p>

      <ShareInvite shares={shares} />
      <ShareList shares={shares} />
    </div>
  );
}
