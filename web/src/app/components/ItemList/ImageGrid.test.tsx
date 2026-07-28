// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ImageGrid } from './ImageGrid';
import type { ImgEntry } from './types';

const img = (n: string): ImgEntry => ({
  pathFull: `${n}.webp`,
  urlFull: `https://example.test/${n}.webp`,
  pathThumb: `${n}.thumb.webp`,
  urlThumb: `https://example.test/${n}.thumb.webp`,
});

function renderGrid(
  imgs: ImgEntry[],
  overrides: Partial<Parameters<typeof ImageGrid>[0]> = {},
) {
  const props = {
    imgs,
    itemTitle: 'Blue Mauritius',
    isOpen: false,
    onOpenModal: vi.fn(),
    onDelete: vi.fn(),
    deletingPath: new Set<string>(),
    busy: false,
    ...overrides,
  };
  return {
    props,
    ...render(
      <I18nProvider>
        <ImageGrid {...props} />
      </I18nProvider>,
    ),
  };
}

describe('ImageGrid', () => {
  beforeEach(() => {
    // I18nProvider falls back to navigator.language ('en-US' in jsdom) on
    // mount unless a stored preference says otherwise; pin it so the
    // alt text below doesn't depend on that incidental default.
    window.localStorage.setItem('lang', 'en');
  });

  it('renders nothing when the item has no images', () => {
    const { container } = renderGrid([]);
    // A placeholder here would be a screenful of empty grey on mobile --
    // the card is expected to collapse to its label instead.
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single image as the hero with no contact strip', () => {
    renderGrid([img('a')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Blue Mauritius — image 1');
  });

  it('renders the first image as hero and the rest as a strip', () => {
    renderGrid([img('a'), img('b'), img('c')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[1]).toHaveAccessibleName('Blue Mauritius — image 2');
    expect(images[2]).toHaveAccessibleName('Blue Mauritius — image 3');
  });

  it('caps the contact strip at four thumbnails', () => {
    renderGrid([
      img('a'),
      img('b'),
      img('c'),
      img('d'),
      img('e'),
      img('f'),
      img('g'),
    ]);
    // hero + 4 strip entries, even though six non-hero images were passed
    expect(screen.getAllByRole('img')).toHaveLength(5);
  });

  it('opens the full-size url rather than the thumbnail', async () => {
    const onOpenModal = vi.fn();
    renderGrid([img('a')], { onOpenModal });
    await userEvent.click(screen.getByRole('img'));
    expect(onOpenModal).toHaveBeenCalledWith('https://example.test/a.webp');
  });

  it('passes the image being removed to onDelete', async () => {
    const onDelete = vi.fn();
    const imgs = [img('a')];
    renderGrid(imgs, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(imgs[0]);
  });

  it('disables delete while that image is already being deleted', () => {
    renderGrid([img('a')], { deletingPath: new Set(['a.webp']) });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('disables delete while the item is busy', () => {
    renderGrid([img('a')], { busy: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
