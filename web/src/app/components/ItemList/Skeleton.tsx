'use client';
import { useI18n } from '../../i18n/useI18n';

// Only the photo plate shimmers: sweeping the caption bars too read as six blinking cards.
const bar = 'rounded-sm bg-muted';

// Shown by `ItemCard` in place of the caption until the hero photograph has loaded.
export function CaptionSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-2 p-4">
      <div className={`h-4 w-2/3 ${bar}`} />
      <div className={`h-3 w-full ${bar}`} />
      <div className="mt-auto flex gap-2 border-t border-border pt-2.5">
        <div className={`h-8 w-16 ${bar}`} />
        <div className={`h-8 w-16 ${bar}`} />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm bg-card ring-1 ring-border card-lift">
      {/* 4:3, the ratio a single photograph gets on a real card. */}
      <div className="img-skeleton aspect-4/3 w-full" />

      <CaptionSkeleton />
    </div>
  );
}

// Six, not nine: two desktop rows read as "a grid is coming"; more only shimmers below the fold.
const CARD_COUNT = 6;

export function GridSkeleton({ count = CARD_COUNT }: { count?: number }) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-label={t('common.loading')}
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// Includes the toolbar row, so search and the buttons don't drop in later and shove the grid down.
export function ItemListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* `w-full sm:flex-1`, not `flex-1`: stacked below `sm`, flex-1 grows vertically and collapses. */}
        <div className={`h-11 w-full sm:flex-1 ${bar}`} />
        <div className="flex gap-2 sm:shrink-0">
          <div className={`h-11 flex-1 sm:w-32 sm:flex-none ${bar}`} />
          <div className={`h-11 w-11 shrink-0 ${bar}`} />
        </div>
      </div>

      <GridSkeleton />
    </div>
  );
}
