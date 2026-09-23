// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useMenu } from './useMenu';

// "elsewhere" has no handler of its own: with one, tests passed without the document listener.
function Harness() {
  const { open, toggle, close, anchorRef, panelRef } = useMenu();
  return (
    <div>
      <button ref={anchorRef} onClick={toggle}>
        trigger
      </button>
      <button>elsewhere</button>
      {open && (
        <div ref={panelRef} role="menu">
          <button>inside the menu</button>
          <button onClick={close}>sign out</button>
        </div>
      )}
    </div>
  );
}

const menu = () => screen.queryByRole('menu');

describe('useMenu', () => {
  it('starts closed', () => {
    render(<Harness />);
    expect(menu()).toBeNull();
  });

  it('opens and closes from the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('trigger'));
    expect(menu()).not.toBeNull();

    await user.click(screen.getByText('trigger'));
    expect(menu()).toBeNull();
  });

  it('stays open while the menu itself is being used', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.click(screen.getByText('inside the menu'));
    expect(menu()).not.toBeNull();
  });

  it('closes when something outside it is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.click(screen.getByText('elsewhere'));
    expect(menu()).toBeNull();
  });

  // An item that acts and then dismisses -- signing out is the real one.
  it('closes from an item inside it that asks it to', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.click(screen.getByText('sign out'));
    expect(menu()).toBeNull();
  });

  it('ignores a key other than Escape while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.keyboard('{a}');
    expect(menu()).not.toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.keyboard('{Escape}');
    expect(menu()).toBeNull();
  });

  // Clicking the trigger already focuses it, so focus must move away first to prove restoration.
  it('returns focus to the trigger after Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));
    screen.getByText('inside the menu').focus();

    await user.keyboard('{Escape}');
    expect(screen.getByText('trigger')).toHaveFocus();
  });

  // A programmatic focus() matches :focus-visible: refocusing after a click earns an unwanted ring.
  it('leaves focus alone when it is dismissed by a click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.click(screen.getByText('elsewhere'));
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  // Closed via "sign out": a click on "elsewhere" natively refocuses it, masking a stray focus().
  it('actually stops listening for Escape once closed, not just stops restoring focus in principle', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('trigger'));
    await user.click(screen.getByText('sign out'));
    // A stray Escape after closing must find no listener left to catch it.
    await user.keyboard('{Escape}');

    await user.click(screen.getByText('trigger'));
    await user.click(screen.getByText('sign out'));

    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('does not attach its outside-click listener before the menu has ever been opened', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('elsewhere'));

    expect(menu()).toBeNull();
  });

  // The listener bookkeeping is the only evidence that a closed menu is not still answering clicks.
  it('hangs no document listener until it is opened, and takes back every one it hangs', async () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);

    expect(addListener).not.toHaveBeenCalled();

    await user.click(screen.getByText('trigger'));
    expect(addListener).toHaveBeenCalledWith('mousedown', expect.any(Function));

    await user.click(screen.getByText('trigger'));
    unmount();

    // A cleanup that runs but names a different handler leaves the listener attached.
    for (const [event, handler] of addListener.mock.calls) {
      expect(removeListener).toHaveBeenCalledWith(event, handler);
    }
    addListener.mockRestore();
    removeListener.mockRestore();
  });

  it('does not attach its Escape listener before the menu has ever been opened', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard('{Escape}');

    await user.click(screen.getByText('trigger'));
    await user.click(screen.getByText('sign out'));

    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('resets its own escape flag after restoring focus, so a later click-dismiss does not also restore it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('trigger'));
    await user.keyboard('{Escape}');
    expect(screen.getByText('trigger')).toHaveFocus();

    await user.click(screen.getByText('trigger'));
    await user.click(screen.getByText('sign out'));

    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('does not steal focus on mount, before it has ever been opened', () => {
    render(<Harness />);
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  // Listeners hang only while open, so a closed menu is not answering every keystroke on the page.
  it('ignores Escape once it is already closed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('trigger'));
    await user.keyboard('{Escape}');
    screen.getByText('elsewhere').focus();

    await user.keyboard('{Escape}');
    expect(screen.getByText('elsewhere')).toHaveFocus();
  });
});
