// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryText } from './CategoryText';

describe('CategoryText', () => {
  it('renders the title as a heading and the name below it', () => {
    render(<CategoryText title="Category" name="Stamps" />);
    expect(screen.getByRole('heading', { name: 'Category' })).toBeVisible();
    expect(screen.getByText('Stamps')).toBeVisible();
  });

  it('shows a placeholder bar instead of the name while loading', () => {
    render(<CategoryText title="Category" name="None selected" loading />);
    expect(screen.getByRole('heading', { name: 'Category' })).toBeVisible();
    expect(screen.queryByText('None selected')).not.toBeInTheDocument();
  });
});
