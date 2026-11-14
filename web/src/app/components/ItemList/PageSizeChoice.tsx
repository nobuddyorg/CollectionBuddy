'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { PAGE_SIZES, type PageSize } from './paging';

/** How many entries a page shows, beside the pager: offered only where a choice changes something. */
export function PageSizeChoice({
  pageSize,
  total,
  onChange,
}: {
  pageSize: PageSize;
  total: number;
  onChange: (size: PageSize) => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  // Even the smallest page holds them all.
  if (total <= PAGE_SIZES[0]) return null;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-testid="page-size"
      className="flex items-center justify-center gap-2 pt-1"
    >
      <span
        id={labelId}
        className="font-label text-[0.6875rem] text-muted-foreground"
      >
        {t('item_list.per_page')}
      </span>
      {PAGE_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          data-testid={`page-size-${size}`}
          aria-pressed={size === pageSize}
          onClick={() => onChange(size)}
          className={`min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 px-2 rounded-sm font-label text-xs transition-colors ${
            size === pageSize
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}
