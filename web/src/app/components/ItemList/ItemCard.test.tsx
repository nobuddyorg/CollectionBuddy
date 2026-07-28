// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ItemCard } from './ItemCard';
import type { ItemLite } from './types';

const item: ItemLite = {
  id: '1',
  title: 'Item',
  description: null,
  place: null,
  tags: [],
};

function renderCard(
  overrides: Partial<ItemLite> = {},
  props: Partial<Parameters<typeof ItemCard>[0]> = {},
) {
  const handlers = {
    onUpload: vi.fn(),
    onEditItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onDeleteImage: vi.fn(),
    onOpenModal: vi.fn(),
  };
  render(
    <I18nProvider>
      <ItemCard
        item={{ ...item, ...overrides }}
        imgs={[]}
        busy={false}
        deletingPath={new Set()}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return handlers;
}

describe('ItemCard', () => {
  beforeEach(() => {
    // I18nProvider falls back to navigator.language ('en-US' in jsdom) on
    // mount unless a stored preference says otherwise; pin it so the
    // labels below don't depend on that incidental default.
    window.localStorage.setItem('lang', 'en');
  });

  it('always shows the title', () => {
    renderCard({ title: 'Blue Mauritius' });
    expect(
      screen.getByRole('heading', { name: 'Blue Mauritius' }),
    ).toBeVisible();
  });

  it('omits description, place and tags when the item has none', () => {
    renderCard({ description: null, place: null, tags: [] });
    expect(screen.queryByText('A reproduction.')).not.toBeInTheDocument();
    expect(screen.queryByText('Port Louis')).not.toBeInTheDocument();
    expect(screen.queryByText('rare')).not.toBeInTheDocument();
  });

  it('shows the description, place and tags when present', () => {
    renderCard({
      description: 'A reproduction.',
      place: 'Port Louis',
      tags: ['rare', 'philately'],
    });
    expect(screen.getByText('A reproduction.')).toBeVisible();
    expect(screen.getByText('Port Louis')).toBeVisible();
    expect(screen.getByText('rare')).toBeVisible();
    expect(screen.getByText('philately')).toBeVisible();
  });

  // Regression: entry actions used to float as bare icons over the photo,
  // colliding with the image's own delete control. They now sit in the
  // label area and name what they act on.
  it('names the entry-level delete so it cannot be read as the image one', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: 'Delete entry' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete image' }),
    ).not.toBeInTheDocument();
  });

  it('exposes edit and add-image actions with labels', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByText('Add image')).toBeVisible();
  });

  it('calls the edit and delete handlers', async () => {
    const handlers = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(handlers.onEditItem).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(handlers.onDeleteItem).toHaveBeenCalledOnce();
  });

  it('disables the file input while an upload is in flight', () => {
    const { container } = render(
      <I18nProvider>
        <ItemCard
          item={item}
          imgs={[]}
          busy={true}
          deletingPath={new Set()}
          onUpload={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onDeleteImage={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });
});
