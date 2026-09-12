/** The small muted caption this interface labels everything with -- a
 * section heading, a field label, a hint line under a control. Same
 * reasoning as `fieldClasses`: the three classes were spelled out by hand
 * in a dozen places, in a dozen different orders. */
export function labelClasses(className = '') {
  return `font-label text-[0.6875rem] text-muted-foreground ${className}`.trim();
}
