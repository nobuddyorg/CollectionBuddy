'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { useMemo } from 'react';

export const getPaginationItems = (page: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page < 5) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (page > totalPages - 4) {
    return [
      1,
      '...',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, '...', page - 1, page, page + 1, '...', totalPages];
};

/* v8 ignore start -- rendered UI; getPaginationItems above is what's
 * gated and mutation-tested. */
// Stryker disable all: rendered UI isn't covered by tests, only
// getPaginationItems above is -- mutants in here would only be noise.
export function Pagination({
  page,
  setPage,
  totalPages,
}: {
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
}) {
  const { t } = useI18n();
  const paginationItems = useMemo(
    () => getPaginationItems(page, totalPages),
    [page, totalPages],
  );

  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={t('item_list.pagination')}
      className="flex flex-wrap gap-1.5 items-center justify-center pt-2"
    >
      <button
        type="button"
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
        className="min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 flex items-center justify-center rounded-sm text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label={t('item_list.previous')}
        title={t('item_list.previous')}
      >
        <Icon icon={IconType.ChevronLeft} className="w-5 h-5" />
      </button>

      {paginationItems.map((item, index) =>
        typeof item === 'string' ? (
          <span
            key={`ellipsis-${index}`}
            aria-hidden="true"
            className="w-5 h-9 flex items-center justify-center text-muted-foreground"
          >
            {item}
          </span>
        ) : (
          <button
            key={item}
            onClick={() => setPage(item)}
            className={
              'min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 px-2 flex items-center justify-center rounded-sm font-label text-xs transition-colors ' +
              (item === page
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted')
            }
            aria-label={t('item_list.page').replace('{n}', String(item))}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => setPage(page + 1)}
        className="min-w-11 min-h-11 sm:min-w-9 sm:min-h-9 flex items-center justify-center rounded-sm text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label={t('item_list.next')}
        title={t('item_list.next')}
      >
        <Icon icon={IconType.ChevronRight} className="w-5 h-5" />
      </button>
    </nav>
  );
}
// Stryker restore all
/* v8 ignore stop */
