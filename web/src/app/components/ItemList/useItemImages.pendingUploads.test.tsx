// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { verifiedUserId } from '../../data/auth';
import {
  createImageRow,
  createSignedUrls,
  listImagesForItems,
  uploadImageObject,
} from '../../data/images';
import { clearImageCache } from './imageCache';
import { useItemImages } from './useItemImages';

vi.mock('../../data/auth', () => ({ verifiedUserId: vi.fn() }));

vi.mock('../../data/images', async () => {
  const actual =
    await vi.importActual<typeof import('../../data/images')>(
      '../../data/images',
    );
  return {
    ...actual,
    createImageRow: vi.fn(),
    createSignedUrls: vi.fn(),
    deleteImageRow: vi.fn(),
    listImagePathsForItems: vi.fn(),
    listImagesForItems: vi.fn(),
    removeImageObjects: vi.fn(),
    uploadImageObject: vi.fn(),
  };
});

// The real one needs a Worker.
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: Blob, options: { maxWidthOrHeight: number }) => {
    return new Blob([`compressed-${options.maxWidthOrHeight}`]);
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

describe('useItemImages pending upload count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearImageCache();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(verifiedUserId).mockResolvedValue('uid');
    vi.mocked(listImagesForItems).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(createSignedUrls).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(uploadImageObject).mockResolvedValue({ error: null } as never);
    vi.mocked(createImageRow).mockResolvedValue({ error: null } as never);
  });

  it('counts concurrent uploads rather than flagging one', async () => {
    const { result } = renderHook(() => useItemImages(), { wrapper });
    let held: (() => void)[] = [];
    vi.mocked(uploadImageObject).mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          held.push(() => resolve({ error: null }));
        }) as never,
    );

    act(() => {
      void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
      void result.current.uploadImage('item-1', new File(['y'], 'b.jpg'));
    });
    await waitFor(() =>
      expect(result.current.pendingUploads['item-1']).toBe(2),
    );

    // Each upload writes a thumbnail after its full size, so whatever is held is released until nothing is.
    await act(async () => {
      while (held.length) {
        const pending = held;
        held = [];
        for (const resolve of pending) resolve();
        await Promise.resolve();
      }
    });
    await waitFor(() =>
      expect(result.current.pendingUploads['item-1']).toBeUndefined(),
    );
  });

  it('drops the count by one rather than clearing it, while a second upload for the same item is still pending', async () => {
    const { result } = renderHook(() => useItemImages(), { wrapper });
    let releaseFull!: () => void;
    vi.mocked(uploadImageObject).mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseFull = () => resolve({ error: null });
        }) as never,
    );

    act(() => {
      void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
    });
    await waitFor(() =>
      expect(result.current.pendingUploads['item-1']).toBe(1),
    );

    // A second upload for the same item runs to completion while the first is still held open.
    await act(async () => {
      await result.current.uploadImage('item-1', new File(['y'], 'b.jpg'));
    });

    expect(result.current.pendingUploads['item-1']).toBe(1);

    await act(async () => {
      releaseFull();
      await Promise.resolve();
    });
  });

  it('does not let one item finishing its upload touch another item still uploading', async () => {
    const { result } = renderHook(() => useItemImages(), { wrapper });
    let releaseItem1!: () => void;
    vi.mocked(uploadImageObject).mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseItem1 = () => resolve({ error: null });
        }) as never,
    );

    act(() => {
      void result.current.uploadImage('item-1', new File(['x'], 'a.jpg'));
    });
    await waitFor(() =>
      expect(result.current.pendingUploads['item-1']).toBe(1),
    );

    await act(async () => {
      await result.current.uploadImage('item-2', new File(['y'], 'b.jpg'));
    });
    expect(result.current.pendingUploads['item-2']).toBeUndefined();

    // item-2 clearing its own entry in `finally` must not have wiped item-1's in-flight count.
    expect(result.current.pendingUploads['item-1']).toBe(1);

    await act(async () => {
      releaseItem1();
      await Promise.resolve();
    });
  });
});
