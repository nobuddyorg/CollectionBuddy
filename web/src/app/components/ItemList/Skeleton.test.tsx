// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { GridSkeleton, ItemListSkeleton } from './Skeleton';

const cardCount = (container: HTMLElement) =>
  container.querySelectorAll('.img-skeleton').length;

describe('GridSkeleton', () => {
  it('announces itself as loading', () => {
    render(
      <I18nProvider>
        <GridSkeleton />
      </I18nProvider>,
    );
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('holds six card frames by default', () => {
    const { container } = render(
      <I18nProvider>
        <GridSkeleton />
      </I18nProvider>,
    );
    expect(cardCount(container)).toBe(6);
  });

  it('holds as many frames as asked for', () => {
    const { container } = render(
      <I18nProvider>
        <GridSkeleton count={2} />
      </I18nProvider>,
    );
    expect(cardCount(container)).toBe(2);
  });
});

describe('ItemListSkeleton', () => {
  it('reserves the toolbar row above the grid', () => {
    const { container } = render(
      <I18nProvider>
        <ItemListSkeleton />
      </I18nProvider>,
    );
    const status = screen.getByRole('status');
    // The grid is the status region; the toolbar sits outside it, so the
    // row that lands above the cards is not part of the placeholder grid.
    expect(status.previousElementSibling).not.toBeNull();
    expect(cardCount(container)).toBe(6);
  });
});
