'use client';

import { labelClasses } from '../ui/labelClasses';

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
  /** The catalogue hasn't resolved yet: a neutral bar stands in for the name. */
  loading?: boolean;
}) {
  return (
    <div className="truncate">
      <h2 data-testid="category-label" className={labelClasses('mb-1')}>
        {title}
      </h2>
      {loading ? (
        <div
          data-testid="selected-category"
          className="h-8 sm:h-9 w-40 max-w-full rounded-sm bg-muted"
        />
      ) : (
        <div
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
