// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner, StatusSpinner } from './Spinner';

describe('Spinner', () => {
  it('renders at the default md size', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveClass('w-5', 'h-5', 'animate-spin');
  });

  it('renders at the sm size when requested', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.firstChild).toHaveClass('w-4', 'h-4');
  });

  it('renders at the lg and xl sizes when requested', () => {
    expect(render(<Spinner size="lg" />).container.firstChild).toHaveClass(
      'w-8',
      'h-8',
    );
    expect(render(<Spinner size="xl" />).container.firstChild).toHaveClass(
      'w-10',
      'h-10',
    );
  });

  // A hardcoded white spinner was invisible on every pale surface (outline buttons, light primary).
  it('inherits currentColor rather than a fixed white', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveClass(
      'border-current/40',
      'border-t-current',
    );
    expect(container.firstChild).not.toHaveClass('border-white/40');
  });
});

describe('StatusSpinner', () => {
  it('announces the spinner as a status named by its label', () => {
    render(<StatusSpinner size="lg" label="Loading…" />);

    const status = screen.getByRole('status', { name: 'Loading…' });
    expect(status.firstChild).toHaveClass('w-8', 'h-8', 'animate-spin');
  });

  it('falls back to the md spinner when no size is given', () => {
    render(<StatusSpinner label="Loading…" />);

    expect(screen.getByRole('status').firstChild).toHaveClass('w-5', 'h-5');
  });
});
