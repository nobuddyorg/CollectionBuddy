'use client';

import type { MenuProps } from './types';

export default function Menu({
  user,
  open,
  onSignOut,
  onClose,
  labelSignOut,
}: MenuProps) {
  if (!open) return null;
  const menuId = 'user-menu';

  return (
    <div
      id={menuId}
      role="menu"
      aria-labelledby="user-menu-button"
      className="absolute right-0 mt-2 w-56 rounded-xl
                 border border-black/10 dark:border-white/10
                 bg-white/90 dark:bg-neutral-900/90
                 backdrop-blur p-1 shadow-lg"
    >
      <div className="px-3 py-2 text-xs opacity-70 truncate">{user.email}</div>
      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          await onSignOut();
          onClose();
        }}
        className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-neutral-800 text-sm"
      >
        {labelSignOut}
      </button>
    </div>
  );
}
