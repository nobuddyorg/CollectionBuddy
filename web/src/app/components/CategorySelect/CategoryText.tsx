'use client';
export function CategoryText({ title, name }: { title: string; name: string }) {
  return (
    <div className="truncate">
      <h2 className="font-label text-[0.6875rem] text-muted-foreground mb-1">
        {title}
      </h2>
      <div className="font-display text-2xl sm:text-3xl truncate text-foreground">
        {name}
      </div>
    </div>
  );
}
