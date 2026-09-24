// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ImageGrid } from './ImageGrid';
import type { ImageEntry } from './types';

const photo = (name: string): ImageEntry => ({
  id: `id-${name}`,
  pathFull: `${name}.webp`,
  urlFull: `https://example.test/${name}.webp`,
  pathThumb: `${name}.thumb.webp`,
  urlThumb: `https://example.test/${name}.thumb.webp`,
});

function renderGrid(
  images: ImageEntry[],
  overrides: Partial<Parameters<typeof ImageGrid>[0]> = {},
) {
  const props = {
    images,
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
    // Pins the locale so the alt text doesn't depend on jsdom's navigator.language default.
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
    const { container } = renderGrid([photo('a')], { loading: false });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  // The browser would otherwise reject Cloudflare's Set-Cookie, scoped to the public suffix supabase.co.
  it('fetches photographs without credentials', () => {
    renderGrid([photo('a'), photo('b')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('crossorigin', 'anonymous');
    }
  });

  it('lazy-loads every plate when the card is not marked as priority', () => {
    renderGrid([photo('a'), photo('b'), photo('c')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image).not.toHaveAttribute('fetchpriority');
    }
  });

  it('fetches only the hero of a priority card eagerly, at high priority', () => {
    renderGrid([photo('a'), photo('b'), photo('c')], { priority: true });
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).not.toHaveAttribute('fetchpriority');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
    expect(images[2]).not.toHaveAttribute('fetchpriority');
  });

  it('renders a single image as one full-width plate', () => {
    renderGrid([photo('a')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Blue Mauritius, image 1');
    expect(images[0]).toHaveClass('aspect-4/3');
  });

  it('renders two images as an equal pair', () => {
    renderGrid([photo('a'), photo('b')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
  });

  it('sources a pair from the thumbnail, not the full image', () => {
    renderGrid([photo('a'), photo('b')]);
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

  // preferThumb (which image to fetch) is independent of `small` (control size).
  it('keeps the full-size delete control on a pair despite sourcing it from the thumbnail', () => {
    renderGrid([photo('a'), photo('b')]);
    for (const button of screen.getAllByRole('button', {
      name: 'Delete image',
    })) {
      expect(button.className).toContain('w-8');
      expect(button.className).not.toContain('w-7');
    }
  });

  it('gives a pair the same image height as a single image on desktop', () => {
    renderGrid([photo('a'), photo('b')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveClass('aspect-square');
      expect(image).toHaveClass('sm:aspect-2/3');
    }
  });

  it('renders the first image as hero and the rest as a strip', () => {
    renderGrid([photo('a'), photo('b'), photo('c')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    expect(images[1]).toHaveAccessibleName('Blue Mauritius, image 2');
    expect(images[2]).toHaveAccessibleName('Blue Mauritius, image 3');
  });

  it('caps the contact strip at four thumbnails', () => {
    renderGrid([
      photo('a'),
      photo('b'),
      photo('c'),
      photo('d'),
      photo('e'),
      photo('f'),
      photo('g'),
    ]);
    // hero + 4 strip entries, even though six non-hero images were passed
    expect(screen.getAllByRole('img')).toHaveLength(5);
  });

  describe('when there are more photographs than the strip can show', () => {
    it('shows no overflow badge right at the strip limit', () => {
      // 1 hero + 4 strip = 5 photographs fill every cell exactly.
      renderGrid([photo('a'), photo('b'), photo('c'), photo('d'), photo('e')]);
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it('badges the last strip cell with the count of photographs it is standing in for', () => {
      // 1 hero + 5 non-hero: image 5's cell is covered and image 6 has none, so the badge counts 2.
      renderGrid([
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
      ]);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('grows the count as more photographs are added past the limit', () => {
      renderGrid([
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
        photo('g'),
      ]);
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('still renders every strip cell, including the badged one', () => {
      renderGrid([
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
      ]);
      // hero + 4 strip cells, the last one carrying the badge on top of it.
      expect(screen.getAllByRole('img')).toHaveLength(5);
    });

    it('opens the modal at the first hidden photograph when the badge is clicked', async () => {
      const onOpenModal = vi.fn();
      renderGrid(
        [
          photo('a'),
          photo('b'),
          photo('c'),
          photo('d'),
          photo('e'),
          photo('f'),
        ],
        {
          onOpenModal,
        },
      );
      await userEvent.click(screen.getByText('+2'));
      expect(onOpenModal).toHaveBeenCalledWith(4);
    });
  });

  it('opens the modal at the photograph position within images', async () => {
    const onOpenModal = vi.fn();
    renderGrid([photo('a')], { onOpenModal });
    await userEvent.click(screen.getByRole('img'));
    expect(onOpenModal).toHaveBeenCalledWith(0);
  });

  it('opens the modal at the clicked strip photograph, not always the hero', async () => {
    const onOpenModal = vi.fn();
    renderGrid([photo('a'), photo('b'), photo('c')], { onOpenModal });
    const images = screen.getAllByRole('img');
    await userEvent.click(images[2]);
    expect(onOpenModal).toHaveBeenCalledWith(2);
  });

  it('renders the hero from the full image and the strip from thumbnails', () => {
    renderGrid([photo('a'), photo('b'), photo('c')]);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'https://example.test/a.webp');
    expect(images[1]).toHaveAttribute(
      'src',
      'https://example.test/b.thumb.webp',
    );
  });

  // Only the covered half: jsdom never dispatches a real image load; uncovering was checked in a browser.
  it('keeps a plate covered until its image loads', () => {
    const { container } = renderGrid([photo('a')]);
    expect(screen.getByRole('img')).toHaveClass('opacity-0');
    expect(container.querySelector('.img-skeleton')).not.toBeNull();
  });

  it('fades the plate in rather than swapping it', () => {
    renderGrid([photo('a')]);
    expect(screen.getByRole('img')).toHaveClass('transition-opacity');
  });

  it('passes the image being removed to onDelete', async () => {
    const onDelete = vi.fn();
    const images = [photo('a')];
    renderGrid(images, { onDelete });
    await userEvent.click(screen.getByRole('button', { name: 'Delete image' }));
    expect(onDelete).toHaveBeenCalledWith(images[0]);
  });

  it('disables delete while the item is busy', () => {
    renderGrid([photo('a')], { busy: true });
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
      const { container } = renderGrid([photo('a')], { pending: 1 });
      expect(screen.getByRole('img')).toHaveClass('sm:aspect-2/3');
      expect(container.querySelectorAll('.grid-cols-2')).toHaveLength(1);
    });

    it('gives the hero to the photographs and the strip to the wait', () => {
      renderGrid([photo('a'), photo('b')], { pending: 1 });
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

  // Only after a failed signing: an unsigned photograph moved into a plate.
  it('holds a loading frame for a plate whose photograph is not signed yet', () => {
    renderGrid([photo('a'), photo('b'), { id: 'id-c', pathFull: 'c.webp' }]);

    expect(
      screen.getByRole('status', { name: 'Loading…' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
