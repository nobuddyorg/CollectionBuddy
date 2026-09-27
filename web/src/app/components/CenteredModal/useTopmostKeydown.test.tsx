// @vitest-environment jsdom
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useTopmostKeydown } from './useTopmostKeydown';

function Layer({
  open,
  onKeyDown,
}: {
  open: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  useTopmostKeydown(open, onKeyDown);
  return null;
}

function Layers({
  handlers,
  open,
}: {
  handlers: ((event: KeyboardEvent) => void)[];
  open: boolean[];
}) {
  return handlers.map((onKeyDown, position) => (
    <Layer key={position} open={open[position]} onKeyDown={onKeyDown} />
  ));
}

// Opened one after another, as a confirm is raised over a dialog that is already up.
function openInTurn(handlers: ((event: KeyboardEvent) => void)[]) {
  const view = render(
    <Layers handlers={handlers} open={handlers.map(() => false)} />,
  );
  const open = handlers.map(() => false);
  for (let position = 0; position < handlers.length; position++) {
    open[position] = true;
    view.rerender(<Layers handlers={handlers} open={[...open]} />);
  }
  return {
    close: (position: number) => {
      open[position] = false;
      view.rerender(<Layers handlers={handlers} open={[...open]} />);
    },
  };
}

describe('useTopmostKeydown', () => {
  it('hands a key to the layer while it is open', async () => {
    const onKeyDown = vi.fn();
    render(<Layer open onKeyDown={onKeyDown} />);

    await userEvent.keyboard('a');
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'a' }),
    );
  });

  it('hands nothing to a closed layer', async () => {
    const onKeyDown = vi.fn();
    render(<Layer open={false} onKeyDown={onKeyDown} />);

    await userEvent.keyboard('a');
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('stops once the layer unmounts', async () => {
    const onKeyDown = vi.fn();
    const { unmount } = render(<Layer open onKeyDown={onKeyDown} />);

    unmount();
    await userEvent.keyboard('a');
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('hears a key once after closing and opening again', async () => {
    const onKeyDown = vi.fn();
    const { rerender } = render(<Layer open onKeyDown={onKeyDown} />);

    rerender(<Layer open={false} onKeyDown={onKeyDown} />);
    rerender(<Layer open onKeyDown={onKeyDown} />);
    await userEvent.keyboard('a');
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('calls the handler of the latest render', async () => {
    const first = vi.fn();
    const next = vi.fn();
    const { rerender } = render(<Layer open onKeyDown={first} />);

    rerender(<Layer open onKeyDown={next} />);
    await userEvent.keyboard('a');
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips a key a nested widget already claimed', () => {
    const onKeyDown = vi.fn();
    render(<Layer open onKeyDown={onKeyDown} />);
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    event.preventDefault();

    window.dispatchEvent(event);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  describe('with layers stacked', () => {
    it('hands a key only to the one opened last', async () => {
      const handlers = [vi.fn(), vi.fn(), vi.fn()];
      openInTurn(handlers);

      await userEvent.keyboard('a');
      expect(handlers[2]).toHaveBeenCalledOnce();
      expect(handlers[0]).not.toHaveBeenCalled();
      expect(handlers[1]).not.toHaveBeenCalled();
    });

    it('hands the keyboard down a layer as each one closes', async () => {
      const handlers = [vi.fn(), vi.fn()];
      const { close } = openInTurn(handlers);

      close(1);
      await userEvent.keyboard('a');
      expect(handlers[0]).toHaveBeenCalledOnce();
      expect(handlers[1]).not.toHaveBeenCalled();
    });

    it('keeps the top layer on top when one beneath it closes', async () => {
      const handlers = [vi.fn(), vi.fn(), vi.fn()];
      const { close } = openInTurn(handlers);

      close(1);
      await userEvent.keyboard('a');
      expect(handlers[2]).toHaveBeenCalledOnce();

      close(2);
      await userEvent.keyboard('b');
      expect(handlers[0]).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'b' }),
      );
      expect(handlers[1]).not.toHaveBeenCalled();
    });
  });
});
