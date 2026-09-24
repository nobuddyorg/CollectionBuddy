// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ItemCard, itemCardPropsAreEqual } from './ItemCard';
import { item, renderCard } from './ItemCard.test-support';
import type { ImageEntry } from './types';

describe('ItemCard', () => {
  beforeEach(() => {
    // Pins the locale so the labels don't depend on jsdom's navigator.language default.
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

  // Regression: entry actions floated over the photo, colliding with the image's own delete control.
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

  it('leads an unphotographed entry with an empty mount', () => {
    render(
      <I18nProvider>
        <ItemCard
          item={item}
          images={[]}
          onUpload={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onDeleteImage={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('No images')).toBeVisible();
  });

  it('keeps the same action row whether or not the entry has photos', () => {
    renderCard();
    // The mount's own call to action, plus the row control.
    expect(screen.getAllByTitle('Add image')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
  });

  it('offers the row control alone once the entry has a photo', () => {
    renderCard({}, { images: [{ id: 'a', pathFull: 'a', urlFull: 'a.jpg' }] });
    // The caption, and the row control living in it, wait for the hero plate to settle.
    fireEvent.load(screen.getByRole('img'));
    expect(screen.getAllByTitle('Add image')).toHaveLength(1);
  });

  // The mount is the resolved empty state; shown while signing is in flight it would flash "no images".
  it('waits for the image listing before declaring an entry empty', () => {
    render(
      <I18nProvider>
        <ItemCard
          item={item}
          images={[]}
          imagesLoading
          onUpload={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onDeleteImage={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.queryByText('No images')).not.toBeInTheDocument();
  });

  it('holds a frame for a photograph that is still being uploaded', () => {
    renderCard({}, { pendingUploads: 1 });
    expect(
      screen.getByRole('status', { name: 'Uploading image…' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No images')).not.toBeInTheDocument();
  });

  it('holds the caption back until the hero photograph has settled', () => {
    renderCard({}, { images: [{ id: 'a', pathFull: 'a', urlFull: 'a.jpg' }] });
    expect(
      screen.queryByRole('heading', { name: 'Item' }),
    ).not.toBeInTheDocument();
    fireEvent.load(screen.getByRole('img'));
    expect(screen.getByRole('heading', { name: 'Item' })).toBeVisible();
  });

  it('shows the caption straight away when a photograph fails to load', () => {
    renderCard({}, { images: [{ id: 'a', pathFull: 'a', urlFull: 'a.jpg' }] });
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('heading', { name: 'Item' })).toBeVisible();
  });

  it('keeps the photographs it already has while another uploads', () => {
    renderCard(
      {},
      {
        images: [{ id: 'a', pathFull: 'a', urlFull: 'a.jpg' }],
        pendingUploads: 1,
      },
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Uploading image…' }),
    ).toBeInTheDocument();
  });

  // Regression: `display: none` pulled the file input out of the tab order entirely.
  it('keeps the add-image controls reachable by keyboard', async () => {
    renderCard();
    const inputs = screen.getAllByTestId('upload-photo');
    await userEvent.tab();
    expect(inputs).toContain(document.activeElement);
    await userEvent.tab();
    expect(inputs).toContain(document.activeElement);
  });

  it('disables the file input while an upload is in flight', () => {
    const { container } = render(
      <I18nProvider>
        <ItemCard
          item={item}
          images={[]}
          pendingUploads={1}
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

describe('itemCardPropsAreEqual', () => {
  const images: ImageEntry[] = [
    { id: 'a', pathFull: 'u/1/a.webp', urlFull: 'a.jpg' },
  ];

  function baseProps(overrides: Partial<Parameters<typeof ItemCard>[0]> = {}) {
    return {
      item,
      images,
      onUpload: vi.fn(),
      onEditItem: vi.fn(),
      onDeleteItem: vi.fn(),
      onDeleteImage: vi.fn(),
      onOpenModal: vi.fn(),
      ...overrides,
    };
  }

  it('treats a different item reference as unequal', () => {
    const previous = baseProps();
    const next = baseProps({ item: { ...item } });
    expect(itemCardPropsAreEqual(previous, next)).toBe(false);
  });

  it('ignores handler identity changes', () => {
    const previous = baseProps();
    const next = baseProps({ onUpload: vi.fn(), onDeleteImage: vi.fn() });
    expect(itemCardPropsAreEqual(previous, next)).toBe(true);
  });
});
