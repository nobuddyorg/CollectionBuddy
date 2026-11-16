// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listImagesForItems } from '../../data/images';
import {
  installDefaultImageMocks,
  renderItemImages,
  row,
} from './useItemImages.test-support';

vi.mock('../../data/auth', () => ({ verifiedUserId: vi.fn() }));

vi.mock('../../data/images', async () => {
  const actual =
    await vi.importActual<typeof import('../../data/images')>(
      '../../data/images',
    );
  return {
    ...actual,
    createSignedUrls: vi.fn(),
    listImagesForItems: vi.fn(),
  };
});

describe('useItemImages updateItemImages', () => {
  beforeEach(() => {
    installDefaultImageMocks();
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [row('img-1', 'item-1'), row('img-2', 'item-1')],
      error: null,
    });
  });

  it('applies an edit to one entry’s photos, in place', async () => {
    const hook = renderItemImages();
    await act(() => hook.result.current.refreshAllImages(['item-1']));

    act(() =>
      hook.result.current.updateItemImages('item-1', (entries) =>
        entries.toReversed(),
      ),
    );

    expect(
      hook.result.current.images['item-1'].map((entry) => entry.id),
    ).toEqual(['img-2', 'img-1']);
  });

  it('leaves an entry it does not show alone, rather than adding it', async () => {
    const hook = renderItemImages();
    await act(() => hook.result.current.refreshAllImages(['item-1']));

    act(() => hook.result.current.updateItemImages('item-2', () => []));

    expect(Object.keys(hook.result.current.images)).toEqual(['item-1']);
  });
});
