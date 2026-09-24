import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

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
import type { ImageEntry } from './types';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

export function row(id: string, itemId: string) {
  return {
    id,
    item_id: itemId,
    path_full: `uid/${itemId}/${id}.webp`,
    path_thumb: null,
  };
}

export function entry(id: string, itemId: string): ImageEntry {
  return {
    id,
    pathFull: `uid/${itemId}/${id}.webp`,
    urlFull: `signed://uid/${itemId}/${id}.webp`,
    pathThumb: undefined,
    urlThumb: undefined,
  };
}

// Relies on the importing test file's `vi.mock('../../data/images')` and `vi.mock('../../data/auth')`.
export function signsEverything() {
  vi.mocked(createSignedUrls).mockImplementation(
    async (paths: string[]) =>
      ({
        data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
        error: null,
      }) as never,
  );
}

export function listsNoImages() {
  vi.mocked(listImagesForItems).mockResolvedValue({
    data: [],
    error: null,
  });
}

export function acceptsUploads() {
  vi.mocked(verifiedUserId).mockResolvedValue('uid');
  vi.mocked(uploadImageObject).mockResolvedValue({ error: null } as never);
  vi.mocked(createImageRow).mockResolvedValue({ error: null } as never);
}

export function resetImageTestState() {
  vi.clearAllMocks();
  clearImageCache();
  window.localStorage.setItem('lang', 'en');
}

export function installDefaultImageMocks() {
  resetImageTestState();
  listsNoImages();
  signsEverything();
}

export function renderItemImages() {
  return renderHook(() => useItemImages(), { wrapper });
}

export async function withOnePhotograph() {
  vi.mocked(listImagesForItems).mockResolvedValue({
    data: [row('img-1', 'item-1')],
    error: null,
  });
  const hook = renderItemImages();
  await act(async () => {
    await hook.result.current.refreshAllImages(['item-1']);
  });
  return hook;
}

export async function acceptConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}
