// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EmptyState from './index';

describe('EmptyState', () => {
  it('shows the title as a heading, the hint and the action below them', () => {
    render(
      <EmptyState symbol="🧺" title="No collections yet" hint="Name one">
        <button type="button">Open help</button>
      </EmptyState>,
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'No collections yet' }),
    ).toBeVisible();
    expect(screen.getByText('Name one')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open help' })).toBeVisible();
  });

  it('keeps the decorative symbol from screen readers', () => {
    render(<EmptyState symbol="🔍" title="No matches" hint="Try another" />);

    expect(screen.getByText('🔍')).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes section props through, so the title can name the region', () => {
    render(
      <EmptyState
        symbol="⚠️"
        title="Could not load"
        hint="Nothing is lost"
        titleId="failure-title"
        titleTestId="failure-heading"
        aria-labelledby="failure-title"
        data-testid="failure"
      />,
    );

    const region = screen.getByRole('region', { name: 'Could not load' });
    expect(region).toHaveAttribute('data-testid', 'failure');
    expect(screen.getByTestId('failure-heading')).toHaveTextContent(
      'Could not load',
    );
  });
});
