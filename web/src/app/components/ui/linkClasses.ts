/** An inline text link: underlined, taking the accent on hover. */
export function linkClasses(className = '') {
  return `underline underline-offset-2 hover:text-accent ${className}`.trim();
}
