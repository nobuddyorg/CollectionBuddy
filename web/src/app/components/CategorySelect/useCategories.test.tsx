// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  createCategory,
  listCategories,
  renameCategory,
} from '../../data/categories';
import { useCategories } from './useCategories';

vi.mock('../../data/categories', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  renameCategory: vi.fn(),
  listItemIdsForCategory: vi.fn(),
  listItemIdsLinkedElsewhere: vi.fn(),
}));

vi.mock('../../data/images', () => ({
  listImagePathsForItems: vi.fn(),
  removeImageObjects: vi.fn(),
  REMOVE_OBJECTS_BATCH_SIZE: 2,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
const CAT_1 = { id: 'cat-1', name: 'Cat 1', user_id: 'owner-1' };

describe('useCategories reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('is loading while the request is in flight, and done once it settles', async () => {
    let release: (value: { data: (typeof CAT_1)[]; error: null }) => void;
    vi.mocked(listCategories).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    let reloadPromise!: Promise<unknown>;
    act(() => {
      reloadPromise = result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      release({ data: [CAT_1], error: null });
      await reloadPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('reports the exact load-error message and logs the underlying error', async () => {
    vi.mocked(listCategories).mockResolvedValue({
      data: null,
      error: new Error('network down'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });

    await act(async () => {
      await result.current.reload();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load collections. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'network down' }),
    );
    consoleError.mockRestore();
  });

  it('keeps loading true while a newer reload supersedes one still resolving', async () => {
    let releaseFirst: (value: { data: never[]; error: null }) => void;
    let releaseSecond: (value: { data: never[]; error: null }) => void;
    vi.mocked(listCategories)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseFirst = resolve;
        }) as never,
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseSecond = resolve;
        }) as never,
      );
    const { result } = renderHook(() => useCategories(), { wrapper });

    let firstPromise!: Promise<unknown>;
    let secondPromise!: Promise<unknown>;
    act(() => {
      firstPromise = result.current.reload();
    });
    act(() => {
      secondPromise = result.current.reload();
    });

    // The stale first request settling must not clear isLoading while the second is in flight.
    await act(async () => {
      releaseFirst({ data: [], error: null });
      await firstPromise;
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      releaseSecond({ data: [], error: null });
      await secondPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useCategories createCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      error: null,
    } as never);
  });

  it('is creating while the request is in flight, and done once it settles', async () => {
    let release: (value: { data: unknown; error: null }) => void;
    vi.mocked(createCategory).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.createCategory('New');
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      release({ data: { id: 'cat-9' }, error: null });
      await createPromise;
    });
    expect(result.current.isCreating).toBe(false);
  });

  it('ignores a second create while one is already in flight', async () => {
    let release: (value: { data: unknown; error: null }) => void;
    vi.mocked(createCategory).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });

    act(() => {
      void result.current.createCategory('New');
    });
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.createCategory('New 2');
    });

    expect(secondResult).toBeNull();
    expect(createCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ data: { id: 'cat-9' }, error: null });
    });
  });

  it('reports the exact create-error message and logs the underlying error under its own scope', async () => {
    vi.mocked(createCategory).mockResolvedValue({
      data: null,
      error: new Error('duplicate name'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.createCategory('New');
    });

    expect(created).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create collection. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'create category',
      expect.objectContaining({ message: 'duplicate name' }),
    );
    consoleError.mockRestore();
  });
});

describe('useCategories renameCategory', () => {
  const CAT_A = { id: 'cat-a', name: 'Cat A', user_id: 'owner-1' };
  const CAT_B = { id: 'cat-b', name: 'Cat B', user_id: 'owner-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(listCategories).mockResolvedValue({
      data: [CAT_A, CAT_B],
      error: null,
    } as never);
  });

  it('renames only the matching category, leaving the rest untouched', async () => {
    vi.mocked(renameCategory).mockResolvedValue({
      data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
      error: null,
    } as never);
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamed: unknown;
    await act(async () => {
      renamed = await result.current.renameCategory('cat-a', 'Renamed A');
    });

    expect(renamed).toBe(true);
    expect(result.current.cats).toEqual([
      { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
      CAT_B,
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Collection renamed.',
    );
  });

  it('is renaming while the request is in flight, and done once it settles', async () => {
    let release: (value: { data: unknown; error: null }) => void;
    vi.mocked(renameCategory).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamePromise!: Promise<unknown>;
    act(() => {
      renamePromise = result.current.renameCategory('cat-a', 'Renamed A');
    });
    expect(result.current.isRenaming).toBe(true);

    await act(async () => {
      release({
        data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
        error: null,
      });
      await renamePromise;
    });
    expect(result.current.isRenaming).toBe(false);
  });

  it('ignores a second rename while one is already in flight', async () => {
    let release: (value: { data: unknown; error: null }) => void;
    vi.mocked(renameCategory).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      void result.current.renameCategory('cat-a', 'Renamed A');
    });
    await waitFor(() => expect(result.current.isRenaming).toBe(true));

    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.renameCategory('cat-a', 'Again');
    });

    expect(secondResult).toBe(false);
    expect(renameCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({
        data: { id: 'cat-a', name: 'Renamed A', user_id: 'owner-1' },
        error: null,
      });
    });
  });

  it('reports the exact rename-error message and logs the underlying error under its own scope, clearing isRenaming even on failure', async () => {
    vi.mocked(renameCategory).mockResolvedValue({
      data: null,
      error: new Error('name taken'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => useCategories(), { wrapper });
    await act(async () => {
      await result.current.reload();
    });

    let renamed: unknown;
    await act(async () => {
      renamed = await result.current.renameCategory('cat-a', 'Renamed A');
    });

    expect(renamed).toBe(false);
    expect(result.current.isRenaming).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not rename this collection. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'rename category',
      expect.objectContaining({ message: 'name taken' }),
    );
    consoleError.mockRestore();
  });
});
