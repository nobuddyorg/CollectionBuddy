/** Shared with IconButton's own `iconButtonClasses` -- the plain,
 * rectangular sibling for a labelled control rather than an icon-square
 * one: the confirm dialog's Cancel and the form's own Cancel drew the
 * exact same box by hand. */
export function buttonClasses(className = '') {
  return `min-h-11 px-4 rounded-sm font-label text-xs ring-1 ring-inset ring-control-border hover:bg-muted transition-colors ${className}`.trim();
}
