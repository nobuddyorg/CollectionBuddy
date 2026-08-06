// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useMenu } from './useMenu';

// A menu is mostly its dismissal rules, and those live in document-level
// listeners rather than in anything the markup shows -- so they are invisible
// to a rendering test that only looks at the panel, and invisible to the
// end-to-end suite too, which has no way to ask where focus went.
// "elsewhere" deliberately has no handler of its own. Giving it one is the
// mistake this harness started with: clicking it closed the menu because of
// the handler, so the test passed with the document listener removed
// entirely, and said nothing about the behaviour it was named after.
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

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.keyboard('{Escape}');
    expect(menu()).toBeNull();
  });

  // Dismissing with the keyboard is the one case where focus has nowhere
  // sensible to land, so it goes back to the trigger.
  it('returns focus to the trigger after Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.keyboard('{Escape}');
    expect(screen.getByText('trigger')).toHaveFocus();
  });

  // The other half of that rule, and the reason it is a rule. Refocusing
  // whenever the menu is shut -- including after a click elsewhere -- gave
  // the trigger a keyboard-style focus ring it had not earned, because a
  // programmatic focus() matches :focus-visible.
  it('leaves focus alone when it is dismissed by a click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('trigger'));

    await user.click(screen.getByText('elsewhere'));
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  it('does not steal focus on mount, before it has ever been opened', () => {
    render(<Harness />);
    expect(screen.getByText('trigger')).not.toHaveFocus();
  });

  // The listeners are hung only while it is open, so a closed menu is not
  // still answering every keystroke on the page.
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
