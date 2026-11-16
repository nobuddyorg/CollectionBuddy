// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastWrapper } from '../providers.test-support';
import type { ImageEntry } from './types';
import { useMakeCover } from './useMakeCover';

const setItemCover = vi.hoisted(() => vi.fn());
vi.mock('../../data/cover', async (importActual) => ({
  ...(await importActual<typeof import('../../data/cover')>()),
  setItemCover,
}));

const entry = (id: string): ImageEntry => ({ id, pathFull: `${id}.webp` });
const photos = [entry('a'), entry('b'), entry('c')];

function renderMakeCover() {
  const updateItemImages =
    vi.fn<
      (itemId: string, update: (entries: ImageEntry[]) => ImageEntry[]) => void
    >();
  const refreshAllImages = vi.fn(async () => {});
  const { result } = renderHook(
    () => useMakeCover({ updateItemImages, refreshAllImages }),
    { wrapper: ToastWrapper },
  );
  return { makeCover: result.current, updateItemImages, refreshAllImages };
}

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  setItemCover
    .mockReset()
    .mockResolvedValue({ data: { id: 'item-1' }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => vi.restoreAllMocks();
});

describe('useMakeCover', () => {
  it('moves the photo to the front at once and stores it as the entry’s cover', async () => {
    const { makeCover, updateItemImages, refreshAllImages } = renderMakeCover();

    await act(() => makeCover('item-1', entry('c')));

    expect(updateItemImages).toHaveBeenCalledOnce();
    const [itemId, update] = updateItemImages.mock.calls[0];
    expect(itemId).toBe('item-1');
    expect(update(photos).map((photo) => photo.id)).toEqual(['c', 'a', 'b']);
    expect(setItemCover).toHaveBeenCalledWith({
      itemId: 'item-1',
      imageId: 'c',
    });
    expect(refreshAllImages).not.toHaveBeenCalled();
  });

  it('says so, and shows the stored order again, when the database refuses', async () => {
    setItemCover.mockResolvedValue({ data: null, error: new Error('RLS') });
    const { makeCover, refreshAllImages } = renderMakeCover();

    await act(() => makeCover('item-1', entry('c')));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The cover could not be changed.',
    );
    expect(console.error).toHaveBeenCalledWith('make cover', new Error('RLS'));
    expect(refreshAllImages).toHaveBeenCalledWith(['item-1']);
  });
});
