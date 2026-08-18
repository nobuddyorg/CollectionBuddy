// @vitest-environment jsdom
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

function Harness({
  open,
  useInitialFocus = false,
  removeTrigger = false,
}: {
  open: boolean;
  useInitialFocus?: boolean;
  /** Mimics an optimistic delete: the button that opened the dialog is
   * gone from the DOM by the time the dialog closes. */
  removeTrigger?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  useFocusTrap(open, container, useInitialFocus ? second : undefined);

  return (
    <div>
      <main id="main-content" tabIndex={-1}>
        main
      </main>
      {!removeTrigger && <button>outside before</button>}
      {open && (
        <div ref={container}>
          <button>first</button>
          <button ref={second}>second</button>
          <button>last</button>
        </div>
      )}
      <button>outside after</button>
    </div>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

describe('useFocusTrap', () => {
  it('moves focus into the dialog when it opens', () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    expect(button('first')).toHaveFocus();
  });

  // Destructive dialogs point focus at Cancel rather than at the action, so
  // the first thing a keyboard confirms is the safe one.
  it('honours a requested starting point over the first control', () => {
    const { rerender } = render(<Harness open={false} useInitialFocus />);
    rerender(<Harness open useInitialFocus />);
    expect(button('second')).toHaveFocus();
  });

  it('gives focus back to where it came from on close', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);

    await user.click(button('outside before'));
    rerender(<Harness open />);
    expect(button('first')).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(button('outside before')).toHaveFocus();
  });

  it('falls back to the main landmark when the trigger was removed while open', () => {
    const { rerender } = render(<Harness open={false} removeTrigger={false} />);

    button('outside before').focus();
    rerender(<Harness open removeTrigger={false} />);
    expect(button('first')).toHaveFocus();

    rerender(<Harness open removeTrigger />);
    rerender(<Harness open={false} removeTrigger />);

    expect(screen.getByText('main')).toHaveFocus();
  });

  it('sends Tab from the last control round to the first', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);

    button('last').focus();
    await user.tab();
    expect(button('first')).toHaveFocus();
  });

  it('sends Shift+Tab from the first control round to the last', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);

    button('first').focus();
    await user.tab({ shift: true });
    expect(button('last')).toHaveFocus();
  });

  // Only the ends wrap; Tab in the middle is left alone.
  it('leaves Tab alone in the middle of the dialog', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);

    button('first').focus();
    await user.tab();
    expect(button('second')).toHaveFocus();
  });

  it('leaves Shift+Tab alone in the middle of the dialog', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);

    button('second').focus();
    await user.tab({ shift: true });
    expect(button('first')).toHaveFocus();
  });

  it('does nothing at all while it is closed', async () => {
    const user = userEvent.setup();
    render(<Harness open={false} />);

    button('outside after').focus();
    await user.tab();
    expect(button('outside after')).not.toHaveFocus();
  });
});
