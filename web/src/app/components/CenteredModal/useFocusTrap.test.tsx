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
  empty = false,
}: {
  open: boolean;
  useInitialFocus?: boolean;
  /** Mimics an optimistic delete: the opener is gone from the DOM by the time the dialog closes. */
  removeTrigger?: boolean;
  /** No focusable controls at all inside the trapped container. */
  empty?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLButtonElement>(null);
  useFocusTrap({
    open,
    containerRef: container,
    initialFocusRef: useInitialFocus ? second : undefined,
  });

  return (
    <div>
      <main id="main-content" tabIndex={-1}>
        main
      </main>
      {!removeTrigger && <button>outside before</button>}
      {open && (
        <div ref={container}>
          {empty ? (
            <p>Nothing to focus</p>
          ) : (
            <>
              <button>first</button>
              <button ref={second}>second</button>
              <button>last</button>
            </>
          )}
        </div>
      )}
      <button>outside after</button>
    </div>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

// Keeps the container mounted while closed: `open` alone must gate the hook, not callers' unmounts.
function AlwaysMountedHarness({ open }: { open: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useFocusTrap({ open, containerRef: container });
  return (
    <div>
      <button>outside</button>
      <div ref={container}>
        <button>inside first</button>
        <button>inside last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog when it opens', () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    expect(button('first')).toHaveFocus();
  });

  // Destructive dialogs start focus on Cancel, so the first thing a keyboard confirms is safe.
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

  it('leaves Tab alone when the dialog has nothing focusable in it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} empty />);
    rerender(<Harness open empty />);

    button('outside before').focus();
    await user.tab();

    expect(screen.getByText('Nothing to focus')).toBeInTheDocument();
  });

  it('does nothing at all while it is closed', async () => {
    const user = userEvent.setup();
    render(<Harness open={false} />);

    button('outside after').focus();
    await user.tab();
    expect(button('outside after')).not.toHaveFocus();
  });

  it('does not steal focus into an already-mounted container while closed', () => {
    render(<AlwaysMountedHarness open={false} />);
    expect(
      screen.getByRole('button', { name: 'inside first' }),
    ).not.toHaveFocus();
  });

  it('does not trap Tab inside an already-mounted container while closed', async () => {
    const user = userEvent.setup();
    render(<AlwaysMountedHarness open={false} />);

    screen.getByRole('button', { name: 'inside last' }).focus();
    await user.tab();

    expect(
      screen.getByRole('button', { name: 'inside first' }),
    ).not.toHaveFocus();
  });

  it('actually removes its Tab listener once it closes, not just stops trapping in principle', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AlwaysMountedHarness open />);
    rerender(<AlwaysMountedHarness open={false} />);

    screen.getByRole('button', { name: 'inside last' }).focus();
    await user.tab();

    expect(
      screen.getByRole('button', { name: 'inside first' }),
    ).not.toHaveFocus();
  });
});
