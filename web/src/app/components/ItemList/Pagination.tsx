'use client';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

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

      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => setPage(n)}
          className={
            'min-w-9 h-9 px-2 flex items-center justify-center rounded-xl shadow-sm ' +
            (n === page
              ? 'bg-primary text-primary-foreground'
              : 'bg-primary/60 text-primary-foreground hover:bg-primary')
          }
          aria-current={n === page ? 'page' : undefined}
        >
          {n}
        </button>
      ))}

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
