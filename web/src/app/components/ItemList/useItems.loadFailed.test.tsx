// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { ToastWrapper as wrapper } from '../providers.test-support';
import { forgetPrefetchedFirstPage } from './firstPagePrefetch';
import { item } from './item.test-support';
import { useItems } from './useItems';
import type { listItems } from '../../data/itemPage';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/itemPage', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

const FAILED = {
  data: null,
  error: new Error('offline'),
  count: null,
  imageRows: null,
};
const ONE_ENTRY = {
  data: [item('coin', { title: 'Denarius' })],
  error: null,
  count: 1,
  imageRows: [],
};

// What postgrest-js does: an aborted fetch resolves with an AbortError `error` instead of rejecting.
function resolvesWithAbortErrorOnAbort({
  signal,
}: Parameters<typeof listItems>[0]) {
  return new Promise((resolve) => {
    signal!.addEventListener('abort', () =>
      resolve({
        data: null,
        error: { message: 'AbortError' },
        count: null,
        imageRows: null,
      }),
    );
  });
}

describe('useItems load failure', () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    listItemsMock.mockReset();
    forgetPrefetchedFirstPage();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('has not failed before any answer arrives', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    expect(result.current.loadFailed).toBe(false);
  });

  it('marks a failed load apart from an empty category', async () => {
    listItemsMock.mockResolvedValue(FAILED);

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('keeps the search wording for a failed search', async () => {
    listItemsMock.mockResolvedValue(FAILED);

    renderHook(() => useItems('cat1', 'denar'), { wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search failed. Please try again.',
    );
  });

  it('clears the failure once a retry answers', async () => {
    listItemsMock.mockResolvedValueOnce(FAILED).mockResolvedValue(ONE_ENTRY);
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    await waitFor(() => expect(result.current.loadFailed).toBe(true));

    await act(() => result.current.reload());

    expect(result.current.loadFailed).toBe(false);
    expect(result.current.items.map((entry) => entry.id)).toEqual(['coin']);
  });

  it('keeps the failure while a retry fails again', async () => {
    listItemsMock.mockResolvedValue(FAILED);
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });
    await waitFor(() => expect(result.current.loadFailed).toBe(true));

    await act(() => result.current.reload());

    expect(result.current.loadFailed).toBe(true);
  });

  // A superseded load answers with an AbortError, which is not a failure the collector should see.
  it('stays silent about a load a newer one aborted', async () => {
    listItemsMock
      .mockImplementationOnce(resolvesWithAbortErrorOnAbort)
      .mockResolvedValue(ONE_ENTRY);
    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await act(() => result.current.reload());

    expect(result.current.loadFailed).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
