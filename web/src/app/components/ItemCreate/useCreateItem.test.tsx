// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { createItem, deleteItem, linkItemToCategory } from '../../data/items';
import { useCreateItem } from './useCreateItem';
import { EMPTY_ITEM_FORM_VALUES } from '../ItemForm/types';
import type { ItemFormValues } from '../ItemForm';

vi.mock('../../data/items', () => ({
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  linkItemToCategory: vi.fn(),
}));

const liveRegion = () => document.body.querySelector('[aria-live="polite"]');

function values(title = 'Title'): ItemFormValues {
  return { ...EMPTY_ITEM_FORM_VALUES, title };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

describe('useCreateItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('does not call createItem when the title is blank', async () => {
    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values('   '));
    });

    expect(ok).toBe(false);
    expect(createItem).not.toHaveBeenCalled();
  });

  it('creates the item, links it to the category, and announces success', async () => {
    vi.mocked(createItem).mockResolvedValue({
      data: { id: 'item-1' },
      error: null,
    } as never);
    vi.mocked(linkItemToCategory).mockResolvedValue({ error: null } as never);

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values());
    });

    expect(ok).toBe(true);
    expect(linkItemToCategory).toHaveBeenCalledWith('item-1', 'cat-1');
    expect(deleteItem).not.toHaveBeenCalled();
    expect(liveRegion()).toHaveTextContent('Entry added.');
  });

  // The rollback this guards: a row that exists but belongs to no category
  // is invisible to every view the app has, and permanently unreachable.
  it('deletes the created item when linking it to the category fails', async () => {
    vi.mocked(createItem).mockResolvedValue({
      data: { id: 'item-1' },
      error: null,
    } as never);
    vi.mocked(linkItemToCategory).mockResolvedValue({
      error: new Error('link failed'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values());
    });

    expect(ok).toBe(false);
    expect(deleteItem).toHaveBeenCalledWith('item-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save this entry. Please try again.',
    );
    consoleError.mockRestore();
  });

  it('does not attempt to delete anything when createItem itself fails', async () => {
    vi.mocked(createItem).mockResolvedValue({
      data: null,
      error: new Error('insert failed'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values());
    });

    expect(ok).toBe(false);
    expect(linkItemToCategory).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
