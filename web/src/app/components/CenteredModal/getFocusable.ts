// offsetParent/getClientRects reflect real layout, which jsdom (this
// project's test environment) never computes -- both come back empty for
// every element regardless of visibility, so a layout-based filter is
// untestable here. getComputedStyle needs no layout pass to resolve
// display/visibility, so it works the same under jsdom and a real browser.
function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
    isVisible,
  );
}
