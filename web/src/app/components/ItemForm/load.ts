// The form's only import() site: Turbopack emits a separate chunk per site, so a prefetch elsewhere warms a copy.
export const loadItemForm = () => import('./index');

/** Warms the form's chunk on intent; a failed prefetch is retried by dynamic() on the actual open. */
export function prefetchItemForm(): void {
  void loadItemForm().catch(() => {});
}
