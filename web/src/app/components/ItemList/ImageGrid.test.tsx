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

  it('renders a single image as one full-width plate', () => {
    renderGrid([img('a')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Blue Mauritius — image 1');
    expect(images[0]).toHaveClass('aspect-4/3');
  });

  // Two photographs are usually a matched pair -- the front and back of a
  // coin, both faces of a stamp. Demoting the second to a thumbnail strip
  // misrepresented that as a main shot plus an afterthought.
  it('renders two images as an equal pair, both at full resolution', () => {
    renderGrid([img('a'), img('b')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://example.test/a.webp');
    expect(images[1]).toHaveAttribute('src', 'https://example.test/b.webp');
  });

  // A half-width cell at 2:3 is (W/2) x (3/4 W), so from `sm` up the pair is
  // exactly as tall as the 4:3 box a single image fills and cards side by
  // side line up. Mobile shows one card per row and keeps the squarer crop.
  //
  // The ratio has to sit on the cells, not as an aspect on their container:
  // a container aspect is not a hard constraint, so the images resolved to
  // their intrinsic height and left the pair ~50px taller than a single
  // image instead of equal.
  it('gives a pair the same image height as a single image on desktop', () => {
    renderGrid([img('a'), img('b')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveClass('aspect-square');
      expect(image).toHaveClass('sm:aspect-2/3');
    }
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

  // The hero spans the whole card, which is wider than the stored
  // thumbnail; sourcing it from the thumb upscaled past its native size.
  it('renders the hero from the full image and the strip from thumbnails', () => {
    renderGrid([img('a'), img('b'), img('c')]);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'https://example.test/a.webp');
    expect(images[1]).toHaveAttribute(
      'src',
      'https://example.test/b.thumb.webp',
    );
  });

  it('passes the image being removed to onDelete', async () => {
    const onDelete = vi.fn();
    const imgs = [img('a')];
    renderGrid(imgs, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }));
    expect(onDelete).toHaveBeenCalledWith(imgs[0]);
  });

  it('disables delete while that image is already being deleted', () => {
    renderGrid([img('a')], { deletingPath: new Set(['a.webp']) });
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  });

  it('disables delete while the item is busy', () => {
    renderGrid([img('a')], { busy: true });
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  });
});
