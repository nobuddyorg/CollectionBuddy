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
});
