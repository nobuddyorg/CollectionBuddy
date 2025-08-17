'use client';
export function CategoryText({ title, name }: { title: string; name: string }) {
  return (
    <div className="truncate">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <div className="font-medium truncate">{name}</div>
    </div>
  );
}
