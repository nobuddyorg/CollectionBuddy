// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ModalImage } from './ModalImage';
import type { ImgEntry } from './types';

const img = (n: string): ImgEntry => ({
  id: `id-${n}`,
  pathFull: `${n}.webp`,
  urlFull: `https://example.test/${n}.webp`,
});

function renderModal(
  overrides: Partial<Parameters<typeof ModalImage>[0]> = {},
) {
  const props = {
    imgs: [img('a')],
    index: 0 as number | null,
    itemTitle: 'Blue Mauritius',
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(),
    deletingPath: new Set<string>(),
    ...overrides,
  };
  const { rerender } = render(
    <I18nProvider>
      <ModalImage {...props} />
    </I18nProvider>,
  );
  return {
    ...props,
    rerender: (next: Partial<Parameters<typeof ModalImage>[0]>) =>
      rerender(
        <I18nProvider>
          <ModalImage {...{ ...props, ...next }} />
        </I18nProvider>,
      ),
  };
}

function appRoot() {
  return document.getElementById('app-root') as HTMLElement;
}

describe('ModalImage', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    const root = document.createElement('div');
    root.id = 'app-root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    appRoot()?.remove();
  });

  it('renders nothing without an index', () => {
    renderModal({ index: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when imgs is empty', () => {
    renderModal({ imgs: [], index: 0 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the image in a modal dialog', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('names the photograph with the entry title and its position', () => {
    renderModal({ imgs: [img('a'), img('b')], index: 1 });
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Blue Mauritius, image 2',
    );
  });

  // Matches the grid: fetched without credentials so the browser never
  // processes Cloudflare's public-suffix-scoped Set-Cookie (#258).
  it('fetches the full-size image without credentials', () => {
    renderModal();
    expect(screen.getByRole('img')).toHaveAttribute('crossorigin', 'anonymous');
  });

  // Regression: the close button used to sit *below* the image in a flex
  // column. With the image free to take max-h-full, it was pushed past the
  // bottom of a fixed, unscrollable overlay and could not be reached at all
  // on a portrait image -- Escape or a backdrop click were the only ways
  // out. It must stay a sibling of the image wrapper, not stacked after it.
  it('keeps the close button outside the image wrapper so it cannot be pushed offscreen', () => {
    renderModal();
    const closeButton = screen.getByRole('button', { name: 'Close' });
    const image = screen.getByRole('img');
    expect(closeButton.contains(image)).toBe(false);
    expect(image.closest('button')).not.toBe(closeButton);
  });

  it('closes when the close button is used', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // A near-miss on Previous/Next/the counter used to fall through to a
  // backdrop click and close the modal instead of stepping it. Only the
  // photograph itself and the explicit Close button dismiss now.
  it('does not close on a backdrop click away from the image', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  // Regression (#511): a tap/click on the photograph itself closes the
  // modal -- #355's stopPropagation made the photo the one place in the
  // overlay that never dismissed it, which read as broken rather than
  // deliberate. The one carved-out exception is the synthetic click that
  // follows a swipe's touchend; see 'swiping' below.
  it('closes when the photograph itself is clicked', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('img'));
    expect(onClose).toHaveBeenCalled();
  });

  // Regression (#295): aria-modal alone is not honoured by every
  // reader/browser pairing, and the Tab trap does not constrain a screen
  // reader's virtual cursor at all -- the rest of the page has to come out
  // of the accessibility tree for browse mode to actually stay inside it.
  it('makes the app root inert while open', () => {
    renderModal();
    expect(appRoot().inert).toBe(true);
  });

  it('restores the app root once the image closes', () => {
    const { rerender } = renderModal();
    expect(appRoot().inert).toBe(true);

    rerender({ index: null });
    expect(appRoot().inert).toBeFalsy();
  });

  // The bug this closes (#304): a photograph past the strip's limit had no
  // rendered Plate at all, so it had no delete control either -- it was
  // unreachable, yet still billed against storage. The modal is now
  // reachable for every photograph in `imgs`, so its own delete control
  // covers the ones the strip never rendered.
  describe('deleting the current photograph', () => {
    it('passes the photograph currently shown to onDelete', async () => {
      const { onDelete } = renderModal({
        imgs: [img('a'), img('b')],
        index: 1,
      });
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete image' }),
      );
      expect(onDelete).toHaveBeenCalledWith(img('b'));
    });

    it('disables delete while that photograph is already being deleted', () => {
      renderModal({ deletingPath: new Set(['a.webp']) });
      expect(
        screen.getByRole('button', { name: 'Delete image' }),
      ).toBeDisabled();
    });

    it('disables delete while the entry is busy', () => {
      renderModal({ busy: true });
      expect(
        screen.getByRole('button', { name: 'Delete image' }),
      ).toBeDisabled();
    });

    it('does not close the modal when delete is clicked', async () => {
      const { onClose } = renderModal();
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete image' }),
      );
      expect(onClose).not.toHaveBeenCalled();
    });

    // Deleting shrinks `imgs` under the same numeric index -- the array
    // closes over the gap, so without reclamping the index would point past
    // the end and the modal would go blank instead of showing what is now
    // there.
    it('falls back to the new last photograph when the last one is deleted', () => {
      const { rerender } = renderModal({
        imgs: [img('a'), img('b')],
        index: 1,
      });
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Blue Mauritius, image 2',
      );

      rerender({ imgs: [img('a')], index: 1 });
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Blue Mauritius, image 1',
      );
    });
  });

  // A single photograph has nowhere to navigate to, so the carousel
  // controls would just be dead chrome.
  describe('with a single photograph', () => {
    it('shows no previous/next controls', () => {
      renderModal({ imgs: [img('a')], index: 0 });
      expect(
        screen.queryByRole('button', { name: 'Previous image' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Next image' }),
      ).not.toBeInTheDocument();
    });

    it('ignores the arrow keys', async () => {
      const { onIndexChange } = renderModal({ imgs: [img('a')], index: 0 });
      await userEvent.keyboard('{ArrowRight}');
      await userEvent.keyboard('{ArrowLeft}');
      expect(onIndexChange).not.toHaveBeenCalled();
    });
  });

  // Reachability is the point of this modal existing at all (#304): every
  // photograph in `imgs`, including the ones past the strip's limit, has to
  // be one click or keypress away from whichever one is currently shown.
  describe('navigating a multi-photograph entry', () => {
    const imgs = [img('a'), img('b'), img('c')];

    it('shows a position counter', () => {
      renderModal({ imgs, index: 1 });
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    // #515: the buttons used to carry `hidden [@media(hover:hover)]:flex`,
    // so a touch screen -- unable to satisfy that query -- had no click
    // alternative to swiping at all. They render unconditionally now.
    it('keeps the previous/next buttons visible regardless of pointer type', () => {
      renderModal({ imgs, index: 1 });
      const prev = screen.getByRole('button', { name: 'Previous image' });
      const next = screen.getByRole('button', { name: 'Next image' });
      expect(prev.className).not.toMatch(/hidden|hover:hover/);
      expect(next.className).not.toMatch(/hidden|hover:hover/);
    });

    it('advances to the next photograph', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 0 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('cycles from the last photograph back to the first', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    it('goes back to the previous photograph', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 1 });
      await userEvent.click(
        screen.getByRole('button', { name: 'Previous image' }),
      );
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    it('cycles from the first photograph back to the last', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 0 });
      await userEvent.click(
        screen.getByRole('button', { name: 'Previous image' }),
      );
      expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    it('does not close the modal when navigating', async () => {
      const { onClose } = renderModal({ imgs, index: 0 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('advances on ArrowRight', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 0 });
      await userEvent.keyboard('{ArrowRight}');
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('goes back on ArrowLeft', async () => {
      const { onIndexChange } = renderModal({ imgs, index: 1 });
      await userEvent.keyboard('{ArrowLeft}');
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    // The whole point of a carousel here: a photograph past the strip's
    // limit (index 3+) was previously never rendered by anything at all.
    it('reaches a photograph beyond the strip limit by index alone', () => {
      const many = [img('a'), img('b'), img('c'), img('d'), img('e'), img('f')];
      renderModal({ imgs: many, index: 5 });
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Blue Mauritius, image 6',
      );
    });

    // #484: the touch equivalent of the Previous/Next buttons, which sit
    // over the photograph and cover real content on a narrow phone screen.
    describe('swiping', () => {
      function swipe(
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) {
        const dialog = screen.getByRole('dialog');
        fireEvent.touchStart(dialog, {
          touches: [{ clientX: from.x, clientY: from.y }],
        });
        fireEvent.touchEnd(dialog, {
          changedTouches: [{ clientX: to.x, clientY: to.y }],
        });
      }

      it('advances on a leftward swipe', () => {
        const { onIndexChange } = renderModal({ imgs, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        expect(onIndexChange).toHaveBeenCalledWith(1);
      });

      it('goes back on a rightward swipe', () => {
        const { onIndexChange } = renderModal({ imgs, index: 1 });
        swipe({ x: 100, y: 100 }, { x: 200, y: 100 });
        expect(onIndexChange).toHaveBeenCalledWith(0);
      });

      it('ignores a drag shorter than the threshold', () => {
        const { onIndexChange } = renderModal({ imgs, index: 0 });
        swipe({ x: 100, y: 100 }, { x: 90, y: 100 });
        expect(onIndexChange).not.toHaveBeenCalled();
      });

      it('ignores a mostly-vertical drag, so it does not steal a scroll or a pinch', () => {
        const { onIndexChange } = renderModal({ imgs, index: 0 });
        swipe({ x: 100, y: 100 }, { x: 120, y: 300 });
        expect(onIndexChange).not.toHaveBeenCalled();
      });

      it('does not close the modal on a swipe', () => {
        const { onClose } = renderModal({ imgs, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        expect(onClose).not.toHaveBeenCalled();
      });

      // A real swipe ends in a browser-synthesized click on whatever was
      // under the finger. Without the suppression this exercises, that
      // click would hit the now-closeable image and immediately dismiss
      // the photograph the swipe just navigated to.
      it('does not close on the synthetic click that follows a swipe', () => {
        const { onClose } = renderModal({ imgs, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        fireEvent.click(screen.getByRole('img'));
        expect(onClose).not.toHaveBeenCalled();
      });
    });
  });

  // A single photograph has nothing to swipe to.
  it('ignores a swipe when there is only one photograph', () => {
    const { onIndexChange } = renderModal({ imgs: [img('a')], index: 0 });
    const dialog = screen.getByRole('dialog');
    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });
    expect(onIndexChange).not.toHaveBeenCalled();
  });
});
