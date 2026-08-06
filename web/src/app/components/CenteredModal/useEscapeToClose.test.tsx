// @vitest-environment jsdom
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useEscapeToClose } from './useEscapeToClose';

function Harness({
  enabled,
  onClose,
}: {
  enabled: boolean;
  onClose: () => void;
}) {
  useEscapeToClose(enabled, onClose);
  return <div>dialog</div>;
}

describe('useEscapeToClose', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores every other key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);

    await user.keyboard('{Enter}');
    await user.keyboard('{Tab}');
    await user.keyboard('a');
    expect(onClose).not.toHaveBeenCalled();
  });

  // A closed dialog still has this hook mounted, and a dialog that answered
  // Escape while shut would be dismissing something it no longer owns.
  it('does nothing while it is disabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness enabled={false} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  // The listener is on the window, so it outlives the component unless it is
  // taken down again -- and a stale one calls back into a dialog that is gone.
  it('stops listening once it is unmounted', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(<Harness enabled onClose={onClose} />);

    unmount();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening as soon as it is disabled again', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Harness enabled onClose={onClose} />);

    rerender(<Harness enabled={false} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});
