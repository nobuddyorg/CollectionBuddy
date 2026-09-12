/** The small muted caption used for section headings, field labels and
 * hint lines. */
export function labelClasses(className = '') {
  return `font-label text-[0.6875rem] text-muted-foreground ${className}`.trim();
}
