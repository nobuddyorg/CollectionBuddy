// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { createItemsInCategory } from '../../data/items';
import { useCreateItem } from './useCreateItem';
import { EMPTY_ITEM_FORM_VALUES } from '../ItemForm/types';
import type { ItemFormValues } from '../ItemForm';

vi.mock('../../data/items', () => ({
  createItemsInCategory: vi.fn(),
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

  it('does not create anything when the title is blank', async () => {
    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values('   '));
    });

    expect(ok).toBe(false);
    expect(createItemsInCategory).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first is still in flight', async () => {
    let release: (value: unknown) => void = () => {};
    vi.mocked(createItemsInCategory).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    act(() => {
      void result.current.create(values());
    });
    await waitFor(() => expect(result.current.isCreating).toBe(true));

    await act(async () => {
      await expect(result.current.create(values())).resolves.toBe(false);
    });

    expect(createItemsInCategory).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ data: null, error: null });
    });
  });

  it('sends an empty tag list when the form value is not an array', async () => {
    vi.mocked(createItemsInCategory).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    await act(async () => {
      await result.current.create({
        ...values(),
        tags: undefined as unknown as string[],
      });
    });

    expect(createItemsInCategory).toHaveBeenCalledWith('cat-1', [
      expect.objectContaining({ tags: [] }),
    ]);
  });

  // One request, one transaction: there is no half-saved entry for a failure to leave behind.
  it('creates the entry in its category with one call, and announces success', async () => {
    vi.mocked(createItemsInCategory).mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create({ ...values(), tags: ['silver'] });
    });

    expect(ok).toBe(true);
    expect(createItemsInCategory).toHaveBeenCalledOnce();
    expect(createItemsInCategory).toHaveBeenCalledWith('cat-1', [
      { ...values(), tags: ['silver'] },
    ]);
    expect(liveRegion()).toHaveTextContent('Entry added.');
    expect(result.current.isCreating).toBe(false);
  });

  it('says the entry limit is reached when the database refuses the entry for its quota', async () => {
    vi.mocked(createItemsInCategory).mockResolvedValue({
      data: null,
      error: { code: 'PT507', message: 'entry quota of 50000 reached' },
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have reached the limit of 50,000 entries.',
    );
    consoleError.mockRestore();
  });

  it('reports a refused save and lets the user try again', async () => {
    const refusal = new Error('cross-tenant assignment is not allowed');
    vi.mocked(createItemsInCategory).mockResolvedValue({
      data: null,
      error: refusal,
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save this entry. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith('create item', refusal);
    expect(result.current.isCreating).toBe(false);
    consoleError.mockRestore();
  });

  it('reports a request that never answered, like any other failed save', async () => {
    vi.mocked(createItemsInCategory).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => useCreateItem('cat-1'), { wrapper });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.create(values());
    });

    expect(ok).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save this entry. Please try again.',
    );
    expect(result.current.isCreating).toBe(false);
    consoleError.mockRestore();
  });
});
