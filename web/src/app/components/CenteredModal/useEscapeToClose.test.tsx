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

  it('does nothing while it is disabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness enabled={false} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

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

  it('does not close when a nested handler already called preventDefault()', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function NestedHandler() {
      useEscapeToClose(true, onClose);
      return (
        <input
          aria-label="inner"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.preventDefault();
          }}
        />
      );
    }
    render(<NestedHandler />);

    await user.click(document.querySelector('input') as HTMLInputElement);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('with a second dialog stacked above', () => {
    function Stack({
      onCloseBeneath,
      onCloseAbove,
      aboveOpen,
    }: {
      onCloseBeneath: () => void;
      onCloseAbove: () => void;
      aboveOpen: boolean;
    }) {
      return (
        <>
          <Harness enabled onClose={onCloseBeneath} />
          <Harness enabled={aboveOpen} onClose={onCloseAbove} />
        </>
      );
    }

    it('closes only the dialog on top', async () => {
      const user = userEvent.setup();
      const onCloseBeneath = vi.fn();
      const onCloseAbove = vi.fn();
      const { rerender } = render(
        <Stack
          onCloseBeneath={onCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen={false}
        />,
      );
      rerender(
        <Stack
          onCloseBeneath={onCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen
        />,
      );

      await user.keyboard('{Escape}');
      expect(onCloseAbove).toHaveBeenCalledOnce();
      expect(onCloseBeneath).not.toHaveBeenCalled();
    });

    it('hands Escape back to the dialog beneath once the top one closes', async () => {
      const user = userEvent.setup();
      const onCloseBeneath = vi.fn();
      const onCloseAbove = vi.fn();
      const { rerender } = render(
        <Stack
          onCloseBeneath={onCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen={false}
        />,
      );
      rerender(
        <Stack
          onCloseBeneath={onCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen
        />,
      );
      rerender(
        <Stack
          onCloseBeneath={onCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen={false}
        />,
      );

      await user.keyboard('{Escape}');
      expect(onCloseBeneath).toHaveBeenCalledOnce();
      expect(onCloseAbove).not.toHaveBeenCalled();
    });

    it('keeps the dialog beneath below when it re-renders with a new onClose', async () => {
      const user = userEvent.setup();
      const onCloseAbove = vi.fn();
      const firstOnCloseBeneath = vi.fn();
      const nextOnCloseBeneath = vi.fn();
      const { rerender } = render(
        <Stack
          onCloseBeneath={firstOnCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen={false}
        />,
      );
      rerender(
        <Stack
          onCloseBeneath={firstOnCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen
        />,
      );
      rerender(
        <Stack
          onCloseBeneath={nextOnCloseBeneath}
          onCloseAbove={onCloseAbove}
          aboveOpen
        />,
      );

      await user.keyboard('{Escape}');
      expect(onCloseAbove).toHaveBeenCalledOnce();
      expect(nextOnCloseBeneath).not.toHaveBeenCalled();
    });
  });
});
