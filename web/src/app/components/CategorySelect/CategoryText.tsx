'use client';
export function CategoryText({ title, name }: { title: string; name: string }) {
  return (
    <div className="truncate">
      <h2 className="font-label text-xs text-muted-foreground mb-1">{title}</h2>
      <div className="font-display text-lg truncate">{name}</div>
    </div>
  );
}
