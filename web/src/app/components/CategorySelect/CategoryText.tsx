'use client';

// Rendered in both panel states so the heading doesn't move when the panel
// toggles open or closed.
export function CategoryText({
  title,
  name,
  placeholder = false,
  loading = false,
}: {
  title: string;
  name: string;
  /** Nothing is selected yet: the line stands in for a name it hasn't got. */
  placeholder?: boolean;
  /** The catalogue hasn't resolved yet, so a neutral bar stands in until the
   *  real name (or "none") is known. */
  loading?: boolean;
}) {
  return (
    <div className="truncate">
      <h2 className="font-label text-[0.6875rem] text-muted-foreground mb-1">
        {title}
      </h2>
      {loading ? (
        <div
          data-testid="selected-category"
          className="h-8 sm:h-9 w-40 max-w-full rounded-sm bg-muted"
        />
      ) : (
        <div
          // data-testid for the e2e suite: the only element still showing
          // the collection name once the strip has collapsed.
          data-testid="selected-category"
          className={`font-display text-2xl sm:text-3xl truncate ${
            placeholder ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {name}
        </div>
      )}
    </div>
  );
}
