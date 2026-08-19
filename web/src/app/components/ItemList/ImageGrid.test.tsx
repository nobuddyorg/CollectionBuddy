// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ImageGrid } from './ImageGrid';
import type { ImgEntry } from './types';

const img = (n: string): ImgEntry => ({
  id: `id-${n}`,
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
    // Pins the locale so the alt text below doesn't depend on jsdom's
    // navigator.language default.
    window.localStorage.setItem('lang', 'en');
  });

  it('renders nothing when the item has no images', () => {
    const { container } = renderGrid([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('holds the frame while the listing is still in flight', () => {
    const { container } = renderGrid([], { loading: true });
    const skeleton = container.querySelector('.img-skeleton');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveClass('aspect-4/3');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the photographs, not the skeleton, once they arrive', () => {
    const { container } = renderGrid([img('a')], { loading: false });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  // Without this, the browser rejects Cloudflare's Set-Cookie on every
  // photograph, since it's scoped to the public suffix supabase.co.
  it('fetches photographs without credentials', () => {
    renderGrid([img('a'), img('b')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('crossorigin', 'anonymous');
    }
  });

  it('lazy-loads every plate when the card is not marked as priority', () => {
    renderGrid([img('a'), img('b'), img('c')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image).not.toHaveAttribute('fetchpriority');
    }
  });

  it('fetches only the hero of a priority card eagerly, at high priority', () => {
    renderGrid([img('a'), img('b'), img('c')], { priority: true });
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).not.toHaveAttribute('fetchpriority');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
    expect(images[2]).not.toHaveAttribute('fetchpriority');
  });

  it('renders a single image as one full-width plate', () => {
    renderGrid([img('a')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Blue Mauritius, image 1');
    expect(images[0]).toHaveClass('aspect-4/3');
  });

  it('renders two images as an equal pair', () => {
    renderGrid([img('a'), img('b')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
  });

  it('sources a pair from the thumbnail, not the full image', () => {
    renderGrid([img('a'), img('b')]);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute(
      'src',
      'https://example.test/a.thumb.webp',
    );
    expect(images[1]).toHaveAttribute(
      'src',
      'https://example.test/b.thumb.webp',
    );
  });

  // preferThumb (which image to fetch) is independent of `small` (control
  // size): a pair's plate is still full size despite sourcing a thumbnail.
  it('keeps the full-size delete control on a pair despite sourcing it from the thumbnail', () => {
    renderGrid([img('a'), img('b')]);
    for (const button of screen.getAllByRole('button', {
      name: 'Delete image',
    })) {
      expect(button.className).toContain('w-8');
      expect(button.className).not.toContain('w-7');
    }
  });

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
    expect(images[1]).toHaveAccessibleName('Blue Mauritius, image 2');
    expect(images[2]).toHaveAccessibleName('Blue Mauritius, image 3');
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

  describe('when there are more photographs than the strip can show', () => {
    it('shows no overflow badge right at the strip limit', () => {
      // 1 hero + 4 strip = 5 photographs fill every cell exactly.
      renderGrid([img('a'), img('b'), img('c'), img('d'), img('e')]);
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it('badges the last strip cell with the count of photographs it is standing in for', () => {
      // 1 hero + 5 non-hero: the last cell (image 5) is covered, and image
      // 6 has no cell of its own -- 2 photographs the badge accounts for.
      renderGrid([img('a'), img('b'), img('c'), img('d'), img('e'), img('f')]);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('grows the count as more photographs are added past the limit', () => {
      renderGrid([
        img('a'),
        img('b'),
        img('c'),
        img('d'),
        img('e'),
        img('f'),
        img('g'),
      ]);
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('still renders every strip cell, including the badged one', () => {
      renderGrid([img('a'), img('b'), img('c'), img('d'), img('e'), img('f')]);
      // hero + 4 strip cells, the last one carrying the badge on top of it.
      expect(screen.getAllByRole('img')).toHaveLength(5);
    });

    it('opens the modal at the first hidden photograph when the badge is clicked', async () => {
      const onOpenModal = vi.fn();
      renderGrid([img('a'), img('b'), img('c'), img('d'), img('e'), img('f')], {
        onOpenModal,
      });
      await userEvent.click(screen.getByText('+2'));
      expect(onOpenModal).toHaveBeenCalledWith(4);
    });
  });

  it('opens the modal at the photograph position within imgs', async () => {
    const onOpenModal = vi.fn();
    renderGrid([img('a')], { onOpenModal });
    await userEvent.click(screen.getByRole('img'));
    expect(onOpenModal).toHaveBeenCalledWith(0);
  });

  it('opens the modal at the clicked strip photograph, not always the hero', async () => {
    const onOpenModal = vi.fn();
    renderGrid([img('a'), img('b'), img('c')], { onOpenModal });
    const images = screen.getAllByRole('img');
    await userEvent.click(images[2]);
    expect(onOpenModal).toHaveBeenCalledWith(2);
  });

  it('renders the hero from the full image and the strip from thumbnails', () => {
    renderGrid([img('a'), img('b'), img('c')]);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'https://example.test/a.webp');
    expect(images[1]).toHaveAttribute(
      'src',
      'https://example.test/b.thumb.webp',
    );
  });

  // Only the covered half is asserted: jsdom never dispatches a real image
  // load, so firing one would prove nothing. Uncovering was checked in a
  // real browser.
  it('keeps a plate covered until its image loads', () => {
    const { container } = renderGrid([img('a')]);
    expect(screen.getByRole('img')).toHaveClass('opacity-0');
    expect(container.querySelector('.img-skeleton')).not.toBeNull();
  });

  it('fades the plate in rather than swapping it', () => {
    renderGrid([img('a')]);
    expect(screen.getByRole('img')).toHaveClass('transition-opacity');
  });

  it('passes the image being removed to onDelete', async () => {
    const onDelete = vi.fn();
    const imgs = [img('a')];
    renderGrid(imgs, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }));
    expect(onDelete).toHaveBeenCalledWith(imgs[0]);
  });

  it('disables delete while the item is busy', () => {
    renderGrid([img('a')], { busy: true });
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  });

  describe('while a photograph is uploading', () => {
    it('stands a placeholder in for it', () => {
      renderGrid([], { pending: 1 });
      const pending = screen.getByRole('status');
      expect(pending).toHaveAccessibleName('Uploading image…');
      expect(pending).toHaveClass('img-skeleton');
      expect(pending).toHaveClass('aspect-4/3');
    });

    it('lays the card out as though the photograph had arrived', () => {
      const { container } = renderGrid([img('a')], { pending: 1 });
      expect(screen.getByRole('img')).toHaveClass('sm:aspect-2/3');
      expect(container.querySelectorAll('.grid-cols-2')).toHaveLength(1);
    });

    it('gives the hero to the photographs and the strip to the wait', () => {
      renderGrid([img('a'), img('b')], { pending: 1 });
      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveClass('aspect-4/3');
      expect(screen.getByRole('status')).toHaveClass('h-20');
    });

    it('holds one frame per upload', () => {
      renderGrid([], { pending: 2 });
      expect(screen.getAllByRole('status')).toHaveLength(2);
    });

    it('takes precedence over the listing skeleton', () => {
      renderGrid([], { pending: 1, loading: true });
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveAccessibleName(
        'Uploading image…',
      );
    });
  });
});
