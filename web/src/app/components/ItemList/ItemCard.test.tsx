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
  place_lat: null,
  place_lng: null,
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

  // Cards with no photograph used to open straight onto the caption, so a
  // scrolling stack of them had no repeating shape to break on. They now
  // lead with an empty mount that holds the same frame a photo would.
  it('leads an unphotographed entry with an empty mount', () => {
    render(
      <I18nProvider>
        <ItemCard
          item={item}
          imgs={[]}
          deletingPath={new Set()}
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

  // The action row is identical on every card, so an unphotographed one
  // carries both the mount's own call to action and the row control. Two
  // ways into the same picker is fine; two *different-looking* action rows
  // depending on whether an entry has been photographed is not.
  it('keeps the same action row whether or not the entry has photos', () => {
    renderCard();
    // The mount's own call to action, plus the row control.
    expect(screen.getAllByTitle('Add image')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
  });

  it('offers the row control alone once the entry has a photo', () => {
    renderCard({}, { imgs: [{ pathFull: 'a', urlFull: 'a.jpg' }] });
    expect(screen.getAllByTitle('Add image')).toHaveLength(1);
  });

  // Regression: the mount is the *resolved* empty state. Showing it while
  // the signed URLs are still in flight flashes "no images" on an entry
  // that has them, then swaps it for a photograph.
  it('waits for the image listing before declaring an entry empty', () => {
    render(
      <I18nProvider>
        <ItemCard
          item={item}
          imgs={[]}
          imagesLoading
          deletingPath={new Set()}
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

  // An upload takes seconds -- compression, then two objects over the
  // wire. The entry showed nothing of that beyond a spinner on a button,
  // so the photograph arrived by shoving the caption down, and a second
  // tap on "add" was the only way to check the first had registered.
  it('holds a frame for a photograph that is still being uploaded', () => {
    renderCard({}, { pendingUploads: 1 });
    expect(
      screen.getByRole('status', { name: 'Uploading image…' }),
    ).toBeInTheDocument();
    // Not the empty mount: inviting a photograph is the wrong thing to say
    // to someone who has just handed one over.
    expect(screen.queryByText('No images')).not.toBeInTheDocument();
  });

  it('keeps the photographs it already has while another uploads', () => {
    renderCard(
      {},
      { imgs: [{ pathFull: 'a', urlFull: 'a.jpg' }], pendingUploads: 1 },
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Uploading image…' }),
    ).toBeInTheDocument();
  });

  // Regression: the file input was hidden with `display: none`, which pulls
  // it out of the tab order entirely -- the label wrapping it is never a
  // tab stop either. That left "Add image" reachable by mouse or touch
  // only, with no other way to attach a photograph.
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
          imgs={[]}
          pendingUploads={1}
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
