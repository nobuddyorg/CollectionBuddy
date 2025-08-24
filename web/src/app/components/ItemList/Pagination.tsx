'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { useMemo } from 'react';

const getPaginationItems = (page: number, totalPages: number) => {
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
    [page, totalPages]
  );

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      <button
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
        title={t('item_list.previous') ?? 'Previous'}
      >
        <Icon
          icon={IconType.ChevronLeft}
          className="w-5 h-5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </button>

      {paginationItems.map((item, index) =>
        typeof item === 'string' ? (
          <span
            key={`ellipsis-${index}`}
            className="w-9 h-9 flex items-center justify-center"
          >
            {item}
          </span>
        ) : (
          <button
            key={item}
            onClick={() => setPage(item)}
            className={
              'min-w-9 h-9 px-2 flex items-center justify-center rounded-xl shadow-sm ' +
              (item === page
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary/60 text-primary-foreground hover:bg-primary')
            }
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        )
      )}

      <button
        disabled={page === totalPages}
        onClick={() => setPage(page + 1)}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
        title={t('item_list.next') ?? 'Next'}
      >
        <Icon
          icon={IconType.ChevronRight}
          className="w-5 h-5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </button>
    </div>
  );
}
