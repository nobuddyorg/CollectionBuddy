// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ModalImage } from './ModalImage';

const URL = 'https://example.test/full.webp';

function renderModal(url: string | null, onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ModalImage url={url} onClose={onClose} />
    </I18nProvider>,
  );
  return onClose;
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

  it('renders nothing without a url', () => {
    renderModal(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the image in a modal dialog', () => {
    renderModal(URL);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  // Matches the grid: fetched without credentials so the browser never
  // processes Cloudflare's public-suffix-scoped Set-Cookie (#258).
  it('fetches the full-size image without credentials', () => {
    renderModal(URL);
    expect(screen.getByRole('img')).toHaveAttribute('crossorigin', 'anonymous');
  });

  // Regression: the close button used to sit *below* the image in a flex
  // column. With the image free to take max-h-full, it was pushed past the
  // bottom of a fixed, unscrollable overlay and could not be reached at all
  // on a portrait image -- Escape or a backdrop click were the only ways
  // out. It must stay a sibling of the image wrapper, not stacked after it.
  it('keeps the close button outside the image wrapper so it cannot be pushed offscreen', () => {
    renderModal(URL);
    const closeButton = screen.getByRole('button', { name: 'Close' });
    const image = screen.getByRole('img');
    expect(closeButton.contains(image)).toBe(false);
    expect(image.closest('button')).not.toBe(closeButton);
  });

  it('closes when the close button is used', async () => {
    const onClose = renderModal(URL);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click', async () => {
    const onClose = renderModal(URL);
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  // Regression (#295): aria-modal alone is not honoured by every
  // reader/browser pairing, and the Tab trap does not constrain a screen
  // reader's virtual cursor at all -- the rest of the page has to come out
  // of the accessibility tree for browse mode to actually stay inside it.
  it('makes the app root inert while open', () => {
    renderModal(URL);
    expect(appRoot().inert).toBe(true);
  });

  it('restores the app root once the image closes', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <I18nProvider>
        <ModalImage url={URL} onClose={onClose} />
      </I18nProvider>,
    );
    expect(appRoot().inert).toBe(true);

    rerender(
      <I18nProvider>
        <ModalImage url={null} onClose={onClose} />
      </I18nProvider>,
    );
    expect(appRoot().inert).toBeFalsy();
  });
});
