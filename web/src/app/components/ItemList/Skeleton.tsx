'use client';
import { useI18n } from '../../i18n/useI18n';

// The shape of the catalogue, held while the catalogue is still on the
// wire. Sign-in used to hand over a page that was finished-looking but
// empty -- the full-screen spinner came down the moment the session
// resolved, and categories and the first page of entries were still two
// round trips away. What filled that gap was a centred "Loading…" line,
// which is a smaller thing than the grid that replaced it, so the page
// visibly jumped when the entries landed.
//
// These placeholders occupy the same boxes the real toolbar and cards
// will, so arriving content swaps in place instead of pushing the page
// around.

// Only the photo plate shimmers. Running the sweep across the caption
// bars as well turned a quiet placeholder into six blinking cards.
const bar = 'rounded-sm bg-muted';

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm bg-card ring-1 ring-border card-lift">
      {/* 4:3, the ratio a single photograph gets on a real card. */}
      <div className="img-skeleton aspect-4/3 w-full" />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className={`h-4 w-2/3 ${bar}`} />
        <div className={`h-3 w-full ${bar}`} />
        <div className="mt-auto flex gap-2 border-t border-border pt-2.5">
          <div className={`h-8 w-16 ${bar}`} />
          <div className={`h-8 w-16 ${bar}`} />
        </div>
      </div>
    </div>
  );
}

// Six rather than a full page of nine: two desktop rows is enough to read
// as "a grid is coming", and nine leaves a column of shimmer far below
// the fold that nobody sees resolve.
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

// The whole list, toolbar included -- for the stretch before `ItemList`
// itself exists, when the category it needs hasn't been resolved yet.
// Without the toolbar row, search and the entry buttons would drop in
// afterwards and shove the grid down.
export function ItemListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* `w-full sm:flex-1`, not a bare `flex-1`: this row stacks below
            `sm`, where `flex-1` grows the box vertically instead of
            horizontally and a bar with no content collapses to nothing. */}
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
