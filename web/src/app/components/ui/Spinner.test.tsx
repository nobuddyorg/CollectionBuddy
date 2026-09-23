// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

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
