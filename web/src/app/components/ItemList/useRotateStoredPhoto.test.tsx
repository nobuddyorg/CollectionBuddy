// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoUpload } from '../../data/photoType';
import { ToastWrapper } from '../providers.test-support';
import type { ImageEntry } from './types';
import { useRotateStoredPhoto } from './useRotateStoredPhoto';

const rotatePhoto = vi.hoisted(() =>
  vi.fn<(file: Blob, degrees: number) => Promise<PhotoUpload>>(),
);
vi.mock('../../lib/photoRotation', () => ({ rotatePhoto }));

const image: ImageEntry = {
  id: 'image-1',
  pathFull: 'user/item/photo.webp',
  urlFull: 'https://example.test/photo.webp',
};
const source = new Blob(['stored']);
const rotated: PhotoUpload = {
  file: new File(['png'], 'rotated.png', { type: 'image/png' }),
  encoding: 'transparent',
};

function renderRotate() {
  const replace = vi.fn(async () => {});
  const { result } = renderHook(() => useRotateStoredPhoto(replace), {
    wrapper: ToastWrapper,
  });
  return { rotate: result.current, replace };
}

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  rotatePhoto.mockReset().mockResolvedValue(rotated);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => vi.restoreAllMocks();
});

describe('useRotateStoredPhoto', () => {
  it('turns the stored photo once and puts the result in the original’s place', async () => {
    const { rotate, replace } = renderRotate();

    await act(() => rotate('item-1', image, { source, degrees: 92.5 }));

    expect(rotatePhoto).toHaveBeenCalledExactlyOnceWith(source, 92.5);
    expect(replace).toHaveBeenCalledExactlyOnceWith('item-1', image, rotated);
  });

  it('keeps the original and says so when the photo cannot be turned', async () => {
    rotatePhoto.mockRejectedValue(new Error('No canvas'));
    const { rotate, replace } = renderRotate();

    await act(() => rotate('item-1', image, { source, degrees: 90 }));

    expect(replace).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be rotated. The original is unchanged',
    );
  });
});
