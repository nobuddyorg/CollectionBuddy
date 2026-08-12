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

  // "Still loading" and "has none" both used to arrive as an empty array,
  // so a card rendered with no image region and then grew one, shoving its
  // caption and buttons down the moment the pictures resolved.
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

  // Load-bearing despite looking like decoration: without it the browser
  // processes Cloudflare's Set-Cookie on every photograph and rejects it,
  // because it is scoped to the public suffix supabase.co (#258).
  it('fetches photographs without credentials', () => {
    renderGrid([img('a'), img('b')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('crossorigin', 'anonymous');
    }
  });

  // The default: everything lazy, nothing telling the browser to hurry.
  it('lazy-loads every plate when the card is not marked as priority', () => {
    renderGrid([img('a'), img('b'), img('c')]);
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveAttribute('loading', 'lazy');
      expect(image).not.toHaveAttribute('fetchpriority');
    }
  });

  // A priority card's hero is the LCP candidate -- fetched eagerly at high
  // priority, same as next/image's old `priority` prop, instead of waiting
  // for layout like the rest of the page's photographs.
  it('fetches only the hero of a priority card eagerly, at high priority', () => {
    renderGrid([img('a'), img('b'), img('c')], { priority: true });
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    // The strip is never the LCP element, priority or not.
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

  // Two photographs are usually a matched pair -- the front and back of a
  // coin, both faces of a stamp. Demoting the second to a thumbnail strip
  // misrepresented that as a main shot plus an afterthought.
  it('renders two images as an equal pair', () => {
    renderGrid([img('a'), img('b')]);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
  });

  // A pair's half is ~178 CSS px -- a quarter-card's worth, not a hero's --
  // so it reads from the stored thumbnail rather than pulling a 1000px
  // image into a slot 1/6th that size (#289).
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

  // preferThumb (which image to fetch) is deliberately independent of
  // `small` (how big the delete control is): a pair's plate is still full
  // size, so shrinking its controls to strip scale just because the source
  // is now a thumbnail would be its own regression.
  it('keeps the full-size delete control on a pair despite sourcing it from the thumbnail', () => {
    renderGrid([img('a'), img('b')]);
    for (const button of screen.getAllByRole('button', {
      name: 'Delete image',
    })) {
      expect(button.className).toContain('w-8');
      expect(button.className).not.toContain('w-7');
    }
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

  // The bug this closes: a sixth photograph had no strip cell, so it was
  // never rendered anywhere -- unviewable and undeletable despite still
  // occupying storage (#304). The last strip cell now covers its own
  // thumbnail with a "+N" badge instead of pretending nothing is past it.
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

    // Clicking the badged cell opens the modal at the photograph it covers
    // -- the first one the strip ran out of room for -- and every one
    // after it becomes reachable from there via the modal's own next/prev.
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

  // A signed URL existing does not mean the bytes have arrived, so a plate
  // starts covered and uncovers on load.
  //
  // Only the covered half is asserted here: next/image never dispatches a
  // load in jsdom (it wires loading through a ref that inspects the real
  // decode), so firing one proves nothing. The uncovering was checked in a
  // real browser instead -- a loaded plate reaches opacity 1 and its
  // skeleton is gone, while a still-loading card keeps its skeleton.
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

  it('disables delete while that image is already being deleted', () => {
    renderGrid([img('a')], { deletingPath: new Set(['a.webp']) });
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  });

  it('disables delete while the item is busy', () => {
    renderGrid([img('a')], { busy: true });
    expect(screen.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  });

  // A photograph being uploaded gets its frame straight away, and keeps it
  // until the photograph itself is there to take it over.
  describe('while a photograph is uploading', () => {
    it('stands a placeholder in for it', () => {
      renderGrid([], { pending: 1 });
      const pending = screen.getByRole('status');
      expect(pending).toHaveAccessibleName('Uploading image…');
      expect(pending).toHaveClass('img-skeleton');
      expect(pending).toHaveClass('aspect-4/3');
    });

    // The point of counting uploads into the layout: the card settles into
    // its final arrangement while the picture is still on its way, rather
    // than rearranging itself the moment it lands.
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

    // The listing skeleton is for "we don't know yet"; an upload is a
    // different, known thing, and it owns the frame while it runs.
    it('takes precedence over the listing skeleton', () => {
      renderGrid([], { pending: 1, loading: true });
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveAccessibleName(
        'Uploading image…',
      );
    });
  });
});
