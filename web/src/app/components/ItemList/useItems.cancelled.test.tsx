// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { ToastWrapper } from '../providers.test-support';
import { takePrefetchedFirstPage } from './firstPagePrefetch';
import { useItems } from './useItems';
import type { listItems } from '../../data/itemPage';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/itemPage', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

function ItemList({ categoryId }: { categoryId: string }) {
  useItems(categoryId, '');
  return null;
}

// What postgrest-js does: an aborted fetch resolves with an AbortError `error` instead of rejecting.
function resolvesWithAbortErrorOnAbort({
  signal,
}: Parameters<typeof listItems>[0]) {
  return new Promise((resolve) => {
    signal!.addEventListener('abort', () =>
      resolve({
        data: null,
        error: { message: 'AbortError: signal is aborted without reason' },
        count: null,
        imageRows: null,
      }),
    );
  });
}

const settle = () => act(async () => {});

describe('useItems when its load is cancelled', () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
    void takePrefetchedFirstPage('');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('reports nothing when the list unmounts mid-load', async () => {
    listItemsMock.mockImplementation(resolvesWithAbortErrorOnAbort);
    const { rerender } = render(<ItemList categoryId="cat1" />, {
      wrapper: ToastWrapper,
    });

    rerender(<></>);
    await settle();

    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // page.tsx keys ItemList by category, so a switch is an unmount of the old list.
  it("reports only the new collection's real failure when the collection switches mid-load", async () => {
    const realError = new Error('rls');
    listItemsMock
      .mockImplementationOnce(resolvesWithAbortErrorOnAbort)
      .mockResolvedValueOnce({
        data: null,
        error: realError,
        count: null,
        imageRows: null,
      });
    // The wrapper outlives the list, like the app's providers do when ItemList remounts per category.
    const { rerender } = render(<ItemList key="cat1" categoryId="cat1" />, {
      wrapper: ToastWrapper,
    });

    rerender(<ItemList key="cat2" categoryId="cat2" />);
    await settle();

    expect(listItemsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: 'cat2' }),
    );
    expect(consoleError.mock.calls).toEqual([['load items', realError]]);
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
  });
});
