/** The text-input / textarea counterpart of `iconButtonClasses`. */
export function fieldClasses(className = '') {
  return `w-full rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-control-border focus:ring-foreground ${className}`.trim();
}
