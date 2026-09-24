// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installDefaultPlaceSearch,
  renderInDialog,
} from './PlaceAutocomplete.test-support';

describe('PlaceAutocomplete menu', () => {
  beforeEach(installDefaultPlaceSearch);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flips the menu above the field when there is not enough room below', async () => {
    const originalInnerHeight = window.innerHeight;
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(window, 'innerHeight', {
      value: 750,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 300,
    });
    try {
      renderInDialog();
      const input = screen.getByRole('combobox');
      input.getBoundingClientRect = () =>
        ({ top: 680, bottom: 700 }) as DOMRect;

      await userEvent.type(input, 'X');
      const listbox = await screen.findByRole('listbox');

      expect(listbox.className).toContain('bottom-full');
    } finally {
      Object.defineProperty(window, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      });
      if (originalOffsetHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'offsetHeight',
          originalOffsetHeight,
        );
      }
    }
  });

  it('closes the menu when something outside the field and its menu is clicked', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    await userEvent.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('tolerates an outside click while focused but before any menu has rendered', async () => {
    renderInDialog('a');
    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await expect(userEvent.click(document.body)).resolves.not.toThrow();
  });

  it('leaves the menu open when the click lands on the menu itself', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    const options = await screen.findAllByRole('option');

    // A mousedown on an option must not count as "outside" and close the menu under the coming click.
    await userEvent.pointer({ target: options[0], keys: '[MouseLeft>]' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.pointer({ target: options[0], keys: '[/MouseLeft]' });
  });

  it('leaves the menu open when the click lands on the field itself', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    await userEvent.click(input);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('leaves the menu open for a click on the wrapper around the field, not just the field or menu', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    fireEvent.mouseDown(input.parentElement!);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('removes its outside-click listener when unmounted, not leaking it into later renders', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderInDialog();
    const input = screen.getByRole('combobox');
    // The listener only attaches while focused.
    await userEvent.type(input, 'X');
    const mousedownAdds = addSpy.mock.calls.filter(
      ([type]) => type === 'mousedown',
    );
    expect(mousedownAdds.length).toBeGreaterThan(0);

    unmount();

    const mousedownRemoves = removeSpy.mock.calls.filter(
      ([type]) => type === 'mousedown',
    );
    expect(mousedownRemoves).toEqual(mousedownAdds);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('closes the menu on Escape without letting the keystroke escape the component', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
