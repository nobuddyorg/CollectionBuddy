// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';

// Spies on the feature's only import() sites: with the opt-in off, neither may ever run.
const load = vi.hoisted(() => ({
  loadBackgroundRemoval: vi.fn(),
  loadCutoutReview: vi.fn(),
}));
vi.mock('./load', () => load);

const toastError = vi.hoisted(() => vi.fn());
vi.mock('../Toast/ToastProvider', async (importActual) => {
  const actual = await importActual<typeof import('../Toast/ToastProvider')>();
  return {
    ...actual,
    useToast: () => ({ ...actual.useToast(), error: toastError }),
  };
});

import { BACKGROUND_REMOVAL_STORAGE_KEY } from './useBackgroundRemovalPreference';
import { useBackgroundRemovalUpload } from './useBackgroundRemovalUpload';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

const photo = new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' });

function setup() {
  const upload = vi.fn(async () => {});
  const hook = renderHook(() => useBackgroundRemovalUpload(upload), {
    wrapper,
  });
  return { upload, ...hook };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  load.loadBackgroundRemoval.mockClear();
  load.loadCutoutReview.mockClear();
  toastError.mockClear();
});

describe('useBackgroundRemovalUpload', () => {
  it('uploads straight away, exactly as before, while the opt-in is off', () => {
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));

    expect(upload).toHaveBeenCalledWith('item-1', { file: photo });
    expect(result.current.pending).toBeNull();
    expect(load.loadBackgroundRemoval).not.toHaveBeenCalled();
    expect(load.loadCutoutReview).not.toHaveBeenCalled();
  });

  it('holds the photo for review instead once the opt-in is on', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual({
      itemId: 'item-1',
      file: photo,
      position: { current: 1, total: 1 },
    });
  });

  // ItemCard's memo keeps an old handler; it must still see a toggle flipped after it was made.
  it('reads the opt-in when a photo is picked, not when the handler was made', () => {
    const { upload, result } = setup();
    const pickPhotos = result.current.pickPhotos;

    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    act(() => pickPhotos('item-1', [photo]));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).not.toBeNull();
  });

  it('refuses a file that is not an image, with a message', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    const { upload, result } = setup();

    act(() =>
      result.current.pickPhotos('item-1', [
        new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
      ]),
    );

    expect(toastError).toHaveBeenCalledWith('Only photos can be added.');
    expect(result.current.pending).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads the original, unchanged, when that is chosen', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));

    act(() => result.current.choose({ kind: 'original' }));

    expect(upload).toHaveBeenCalledWith('item-1', { file: photo });
    expect(result.current.pending).toBeNull();
  });

  it('uploads the cut-out as a PNG that keeps its transparency', async () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));
    const blob = new Blob(['png'], { type: 'image/png' });

    act(() => result.current.choose({ kind: 'cut-out', blob }));

    const [itemId, { file, encoding }] = upload.mock.calls[0] as unknown as [
      string,
      { file: File; encoding: string },
    ];
    expect(itemId).toBe('item-1');
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('cutout.png');
    expect(await file.text()).toBe('png');
    expect(encoding).toBe('transparent');
    expect(result.current.pending).toBeNull();
  });

  it('uploads nothing when the review is cancelled', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));

    act(() => result.current.choose({ kind: 'cancel' }));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('uploads nothing for a choice with no photo pending', () => {
    const { upload, result } = setup();

    act(() => result.current.choose({ kind: 'original' }));

    expect(upload).not.toHaveBeenCalled();
  });
  describe('with several photos picked at once', () => {
    const second = new File(['jpeg2'], 'medal.jpg', { type: 'image/jpeg' });
    const third = new File(['jpeg3'], 'ring.jpg', { type: 'image/jpeg' });

    it('uploads them one after the other, in pick order, while the opt-in is off', async () => {
      const finish: Array<() => void> = [];
      const upload = vi.fn(
        () => new Promise<void>((resolve) => finish.push(resolve)),
      );
      const { result } = renderHook(() => useBackgroundRemovalUpload(upload), {
        wrapper,
      });

      act(() => result.current.pickPhotos('item-1', [photo, second, third]));

      expect(upload.mock.calls).toEqual([['item-1', { file: photo }]]);
      await act(async () => finish[0]());
      expect(upload.mock.calls.at(-1)).toEqual(['item-1', { file: second }]);
      await act(async () => finish[1]());
      expect(upload.mock.calls.at(-1)).toEqual(['item-1', { file: third }]);
    });

    it('reviews them one at a time, counting from the first', () => {
      localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
      const { upload, result } = setup();

      act(() => result.current.pickPhotos('item-1', [photo, second, third]));
      expect(result.current.pending).toEqual({
        itemId: 'item-1',
        file: photo,
        position: { current: 1, total: 3 },
      });

      act(() => result.current.choose({ kind: 'original' }));
      expect(result.current.pending).toEqual({
        itemId: 'item-1',
        file: second,
        position: { current: 2, total: 3 },
      });
      expect(upload).toHaveBeenCalledTimes(1);

      const blob = new Blob(['png'], { type: 'image/png' });
      act(() => result.current.choose({ kind: 'cut-out', blob }));
      expect(result.current.pending?.file).toBe(third);
      expect(upload).toHaveBeenCalledTimes(2);

      act(() => result.current.choose({ kind: 'original' }));
      expect(result.current.pending).toBeNull();
      expect(upload).toHaveBeenCalledTimes(3);
      expect(
        (upload.mock.calls as unknown as Array<[string, { file: File }]>).map(
          ([, { file }]) => file.name,
        ),
      ).toEqual(['coin.jpg', 'cutout.png', 'ring.jpg']);
    });

    it('drops the photos still waiting when the review is cancelled', () => {
      localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
      const { upload, result } = setup();
      act(() => result.current.pickPhotos('item-1', [photo, second]));
      act(() => result.current.choose({ kind: 'original' }));

      act(() => result.current.choose({ kind: 'cancel' }));

      expect(result.current.pending).toBeNull();
      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('reviews the photos among them and says once that the others were refused', () => {
      localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
      const { result } = setup();
      const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
      const text = new File(['hi'], 'b.txt', { type: 'text/plain' });

      act(() => result.current.pickPhotos('item-1', [pdf, photo, text]));

      expect(toastError).toHaveBeenCalledTimes(1);
      expect(result.current.pending).toEqual({
        itemId: 'item-1',
        file: photo,
        position: { current: 1, total: 1 },
      });
    });
  });
});
