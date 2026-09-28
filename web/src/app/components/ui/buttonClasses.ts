const LABELLED_BASE = 'min-h-11 px-4 rounded-sm font-label text-xs';

export const FILL_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
} as const;

/** The rectangular sibling of `iconButtonClasses`, for a labelled control. */
export function buttonClasses(className = '') {
  return `${LABELLED_BASE} ring-1 ring-inset ring-control-border hover:bg-muted transition-colors ${className}`.trim();
}

export function filledButtonClasses(
  variant: keyof typeof FILL_CLASSES,
  className = '',
) {
  return `${LABELLED_BASE} ${FILL_CLASSES[variant]} ${className}`.trim();
}
