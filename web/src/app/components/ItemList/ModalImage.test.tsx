// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ModalImage } from './ModalImage';
import type { ImgEntry } from './types';

const img = (n: string): ImgEntry => ({
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
      'Blue Mauritius — image 2',
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

  it('closes on a backdrop click', async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole('dialog'));
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
        'Blue Mauritius — image 2',
      );

      rerender({ imgs: [img('a')], index: 1 });
      expect(screen.getByRole('img')).toHaveAccessibleName(
        'Blue Mauritius — image 1',
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
      expect(screen.getByText('2 of 3')).toBeInTheDocument();
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
        'Blue Mauritius — image 6',
      );
    });
  });
});
