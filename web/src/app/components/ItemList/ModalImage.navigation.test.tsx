// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ModalImage } from './ModalImage';
import type { ImageEntry } from './types';

const photo = (name: string): ImageEntry => ({
  id: `id-${name}`,
  pathFull: `${name}.webp`,
  urlFull: `https://example.test/${name}.webp`,
});

function renderModal(
  overrides: Partial<Parameters<typeof ModalImage>[0]> = {},
) {
  const props = {
    images: [photo('a')],
    index: 0 as number | null,
    itemTitle: 'Blue Mauritius',
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(),
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

  // Every photograph, including ones past the strip's limit, is one click or keypress away.
  describe('navigating a multi-photograph entry', () => {
    const images = [photo('a'), photo('b'), photo('c')];

    it('shows a position counter', () => {
      renderModal({ images, index: 1 });
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    // The buttons used to hide on touch screens, leaving no click alternative to swiping.
    it('keeps the previous/next buttons visible regardless of pointer type', () => {
      renderModal({ images, index: 1 });
      const previous = screen.getByRole('button', { name: 'Previous image' });
      const next = screen.getByRole('button', { name: 'Next image' });
      expect(previous.className).not.toMatch(/hidden|hover:hover/);
      expect(next.className).not.toMatch(/hidden|hover:hover/);
    });

    it('advances to the next photograph', async () => {
      const { onIndexChange } = renderModal({ images, index: 0 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('cycles from the last photograph back to the first', async () => {
      const { onIndexChange } = renderModal({ images, index: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    it('goes back to the previous photograph', async () => {
      const { onIndexChange } = renderModal({ images, index: 1 });
      await userEvent.click(
        screen.getByRole('button', { name: 'Previous image' }),
      );
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    it('cycles from the first photograph back to the last', async () => {
      const { onIndexChange } = renderModal({ images, index: 0 });
      await userEvent.click(
        screen.getByRole('button', { name: 'Previous image' }),
      );
      expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    it('does not close the modal when navigating', async () => {
      const { onClose } = renderModal({ images, index: 0 });
      await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores a key that is not an arrow', async () => {
      const { onIndexChange } = renderModal({ images, index: 0 });
      await userEvent.keyboard('a');
      expect(onIndexChange).not.toHaveBeenCalled();
    });

    // A keystroke another listener already claimed must not also page the carousel.
    it('does not navigate on an arrow key another handler already claimed', () => {
      const { onIndexChange } = renderModal({ images, index: 0 });
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      window.dispatchEvent(event);

      expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('advances on ArrowRight', async () => {
      const { onIndexChange } = renderModal({ images, index: 0 });
      await userEvent.keyboard('{ArrowRight}');
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('goes back on ArrowLeft', async () => {
      const { onIndexChange } = renderModal({ images, index: 1 });
      await userEvent.keyboard('{ArrowLeft}');
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    // A photograph past the strip's limit was previously never rendered by anything.
    it('reaches a photograph beyond the strip limit by index alone', () => {
      const many = [
        photo('a'),
        photo('b'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
      ];
      renderModal({ images: many, index: 5 });
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Blue Mauritius, image 6',
      );
    });

    // The touch equivalent of Previous/Next, which cover content on a narrow phone screen.
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
        const { onIndexChange } = renderModal({ images, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        expect(onIndexChange).toHaveBeenCalledWith(1);
      });

      it('goes back on a rightward swipe', () => {
        const { onIndexChange } = renderModal({ images, index: 1 });
        swipe({ x: 100, y: 100 }, { x: 200, y: 100 });
        expect(onIndexChange).toHaveBeenCalledWith(0);
      });

      it('ignores a drag shorter than the threshold', () => {
        const { onIndexChange } = renderModal({ images, index: 0 });
        swipe({ x: 100, y: 100 }, { x: 90, y: 100 });
        expect(onIndexChange).not.toHaveBeenCalled();
      });

      it('ignores a mostly-vertical drag, so it does not steal a scroll or a pinch', () => {
        const { onIndexChange } = renderModal({ images, index: 0 });
        swipe({ x: 100, y: 100 }, { x: 120, y: 300 });
        expect(onIndexChange).not.toHaveBeenCalled();
      });

      it('does not close the modal on a swipe', () => {
        const { onClose } = renderModal({ images, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        expect(onClose).not.toHaveBeenCalled();
      });

      // A real swipe ends in a synthetic click; unsuppressed, it would dismiss the photograph just paged to.
      it('does not close on the synthetic click that follows a swipe', () => {
        const { onClose } = renderModal({ images, index: 0 });
        swipe({ x: 200, y: 100 }, { x: 100, y: 100 });
        fireEvent.click(screen.getByRole('img'));
        expect(onClose).not.toHaveBeenCalled();
      });

      it('tolerates a touchstart with no touch point', () => {
        const { onIndexChange } = renderModal({ images, index: 0 });
        const dialog = screen.getByRole('dialog');
        expect(() =>
          fireEvent.touchStart(dialog, { touches: [] }),
        ).not.toThrow();
        fireEvent.touchEnd(dialog, {
          changedTouches: [{ clientX: 100, clientY: 100 }],
        });
        expect(onIndexChange).not.toHaveBeenCalled();
      });

      it('tolerates a touchend with no touch point', () => {
        const { onIndexChange } = renderModal({ images, index: 0 });
        const dialog = screen.getByRole('dialog');
        fireEvent.touchStart(dialog, {
          touches: [{ clientX: 200, clientY: 100 }],
        });
        expect(() =>
          fireEvent.touchEnd(dialog, { changedTouches: [] }),
        ).not.toThrow();
        expect(onIndexChange).not.toHaveBeenCalled();
      });
    });
  });
});
