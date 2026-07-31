'use client';

// The heading of the category strip: the label, and under it the name of
// the collection on show. It is rendered in both states of the panel --
// open and closed -- because it is what the panel is *about*. Showing it
// in only one of them moved the heading on every toggle, which reads as
// the page jumping rather than as a panel opening.
export function CategoryText({
  title,
  name,
  placeholder = false,
}: {
  title: string;
  name: string;
  /** Nothing is selected yet: the line stands in for a name it hasn't got. */
  placeholder?: boolean;
}) {
  return (
    <div className="truncate">
      <h2 className="font-label text-[0.6875rem] text-muted-foreground mb-1">
        {title}
      </h2>
      <div
        className={`font-display text-2xl sm:text-3xl truncate ${
          placeholder ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {name}
      </div>
    </div>
  );
}
