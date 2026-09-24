/** The rectangular sibling of `iconButtonClasses`, for a labelled control. */
export function buttonClasses(className = '') {
  return `min-h-11 px-4 rounded-sm font-label text-xs ring-1 ring-inset ring-control-border hover:bg-muted transition-colors ${className}`.trim();
}
