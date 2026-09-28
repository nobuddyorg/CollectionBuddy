type Props = {
  symbol: string;
  title: string;
  hint: string;
  titleId?: string;
  titleTestId?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<'section'>, 'className'>;

export default function EmptyState({
  symbol,
  title,
  hint,
  titleId,
  titleTestId,
  children,
  ...sectionProps
}: Props) {
  return (
    <section
      {...sectionProps}
      className="py-16 grid place-items-center text-center"
    >
      <div className="flex flex-col items-center gap-4 max-w-xs">
        <div
          aria-hidden="true"
          className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl"
        >
          {symbol}
        </div>
        <div className="space-y-1.5">
          <h3
            id={titleId}
            data-testid={titleTestId}
            className="font-display text-lg text-foreground"
          >
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
