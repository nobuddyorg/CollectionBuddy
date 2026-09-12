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
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

const COINS = { id: 'cat-1', name: 'Coins', user_id: 'owner-1' };
const STAMPS = { id: 'cat-2', name: 'Stamps', user_id: 'owner-1' };

function lists(cats: (typeof COINS)[]) {
  vi.mocked(listCategories).mockResolvedValue({
    data: cats,
    error: null,
  } as never);
}

async function loaded() {
  const hook = renderHook(() => useCategories(), { wrapper });
  await act(async () => {
    await hook.result.current.reload();
  });
  return hook;
}

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    lists([COINS, STAMPS]);
  });

  describe('reload', () => {
    it('holds the loading state until the listing lands', async () => {
      const { result } = renderHook(() => useCategories(), { wrapper });
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.cats).toEqual([COINS, STAMPS]);
    });

    it('reports a failed listing and leaves the strip empty', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(listCategories).mockResolvedValue({
        data: null,
        error: new Error('rls'),
      } as never);

      const { result } = renderHook(() => useCategories(), { wrapper });
      await act(async () => {
        await expect(result.current.reload()).resolves.toEqual([]);
      });

      expect(await screen.findByRole('alert')).toBeVisible();
      expect(result.current.cats).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      consoleError.mockRestore();
    });

    // Every auth event reloads, with no guarantee the answers come back in
    // the order they were asked for.
    it('lets a newer listing win over one that resolves later', async () => {
      let releaseFirst: (value: unknown) => void = () => {};
      vi.mocked(listCategories)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            releaseFirst = resolve;
          }) as never,
        )
        .mockResolvedValue({ data: [STAMPS], error: null } as never);

      const { result } = renderHook(() => useCategories(), { wrapper });
      act(() => {
        void result.current.reload();
      });
      await act(async () => {
        await result.current.reload();
      });
      await act(async () => {
        releaseFirst({ data: [COINS], error: null });
      });

      expect(result.current.cats).toEqual([STAMPS]);
    });
  });

  describe('createCategory', () => {
    it('creates the category and reloads the strip', async () => {
      vi.mocked(createCategory).mockResolvedValue({
        data: { id: 'cat-3', name: 'Cameras', user_id: 'owner-1' },
        error: null,
      } as never);
      const { result } = await loaded();

      let created: unknown;
      await act(async () => {
        created = await result.current.createCategory('Cameras');
      });

      expect(created).toMatchObject({ id: 'cat-3' });
      expect(listCategories).toHaveBeenCalledTimes(2);
      expect(result.current.isCreating).toBe(false);
    });

    it('refuses an empty name without asking the database', async () => {
      const { result } = await loaded();

      await act(async () => {
        await expect(result.current.createCategory('')).resolves.toBeNull();
      });

      expect(createCategory).not.toHaveBeenCalled();
    });

    it('reports a failed create and hands back nothing', async () => {
      vi.mocked(createCategory).mockResolvedValue({
        data: null,
        error: new Error('duplicate'),
      } as never);
      const { result } = await loaded();

      await act(async () => {
        await expect(
          result.current.createCategory('Coins'),
        ).resolves.toBeNull();
      });

      expect(await screen.findByRole('alert')).toBeVisible();
      expect(result.current.isCreating).toBe(false);
    });
  });

  describe('renameCategory', () => {
    // The trigger normalises the name, so what lands in the strip is the
    // row the database answered with, not the text that was typed.
    it('keeps the name the database returned, not the one sent', async () => {
      vi.mocked(renameCategory).mockResolvedValue({
        data: { id: 'cat-1', name: 'Coins & Medals', user_id: 'owner-1' },
        error: null,
      } as never);
      const { result } = await loaded();

      await act(async () => {
        await expect(
          result.current.renameCategory('cat-1', '  coins & medals  '),
        ).resolves.toBe(true);
      });

      expect(renameCategory).toHaveBeenCalledWith('cat-1', 'coins & medals');
      expect(result.current.cats[0]?.name).toBe('Coins & Medals');
      expect(await screen.findByRole('status')).toBeVisible();
    });

    it('refuses a blank new name without asking the database', async () => {
      const { result } = await loaded();

      await act(async () => {
        await expect(
          result.current.renameCategory('cat-1', '   '),
        ).resolves.toBe(false);
      });

      expect(renameCategory).not.toHaveBeenCalled();
    });

    it('reports a failed rename and leaves the old name in place', async () => {
      vi.mocked(renameCategory).mockResolvedValue({
        data: null,
        error: new Error('rls'),
      } as never);
      const { result } = await loaded();

      await act(async () => {
        await expect(
          result.current.renameCategory('cat-1', 'Münzen'),
        ).resolves.toBe(false);
      });

      expect(await screen.findByRole('alert')).toBeVisible();
      expect(result.current.cats[0]?.name).toBe('Coins');
    });

    it('leaves the strip alone when the rename answers with no row', async () => {
      vi.mocked(renameCategory).mockResolvedValue({
        data: null,
        error: null,
      } as never);
      const { result } = await loaded();

      await act(async () => {
        await expect(
          result.current.renameCategory('cat-1', 'Münzen'),
        ).resolves.toBe(true);
      });

      expect(result.current.cats).toEqual([COINS, STAMPS]);
    });
  });

  describe('optimisticRemove', () => {
    it('hides the category and puts it back at its own position', async () => {
      const { result } = await loaded();

      let restore: (() => void) | null = null;
      act(() => {
        restore = result.current.optimisticRemove('cat-1');
      });
      expect(result.current.cats).toEqual([STAMPS]);

      act(() => restore?.());
      await waitFor(() => expect(result.current.cats).toEqual([COINS, STAMPS]));
    });

    it('answers with nothing for a category that is already gone', async () => {
      const { result } = await loaded();

      act(() => {
        expect(result.current.optimisticRemove('cat-nope')).toBeNull();
      });

      expect(result.current.cats).toEqual([COINS, STAMPS]);
    });
  });
});
