/** Shared with IconButton's own `iconButtonClasses` -- the text-input /
 * textarea counterpart, since both the rename field, the new-category
 * field, the two ItemForm fields and the place autocomplete drew the exact
 * same box by hand. */
export function fieldClasses(className = '') {
  return `w-full rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-control-border focus:ring-foreground ${className}`.trim();
}
