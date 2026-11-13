// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { PhotoUpload } from '../../data/photoType';
import type { Sharpness } from '../../lib/photoSharpness';
import type { ImageEntry } from '../ItemList/types';
import { ToastProvider } from '../Toast/ToastProvider';

// Spies on the feature's only import() sites: with the opt-in off, neither may ever run.
const load = vi.hoisted(() => ({
  loadBackgroundRemoval: vi.fn(),
  loadCutoutReview: vi.fn(),
}));
vi.mock('./load', () => load);

const assessSharpness = vi.hoisted(() =>
  vi.fn<(file: Blob) => Promise<Sharpness>>(),
);
vi.mock('../../lib/photoSharpness', () => ({ assessSharpness }));

const downloadImageObject = vi.hoisted(() =>
  vi.fn<
    (
      path: string,
    ) => Promise<{ data: Blob; error: null } | { data: null; error: Error }>
  >(),
);
vi.mock('../../data/images', () => ({ downloadImageObject }));

const toastError = vi.hoisted(() => vi.fn());
const toastReportError = vi.hoisted(() => vi.fn());
vi.mock('../Toast/ToastProvider', async (importActual) => {
  const actual = await importActual<typeof import('../Toast/ToastProvider')>();
  return {
    ...actual,
    useToast: () => ({
      ...actual.useToast(),
      error: toastError,
      reportError: toastReportError,
    }),
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
const second = new File(['jpeg2'], 'medal.jpg', { type: 'image/jpeg' });
const third = new File(['jpeg3'], 'ring.jpg', { type: 'image/jpeg' });

type Upload = (itemId: string, photo: PhotoUpload) => Promise<void>;
type Replace = (
  itemId: string,
  image: ImageEntry,
  photo: PhotoUpload,
) => Promise<void>;

/** Each check waits until the test answers it, by file name. */
const checks = new Map<string, (sharpness: Sharpness) => void>();
function checkAnswersOnCue() {
  assessSharpness.mockImplementation(
    (file) =>
      new Promise((resolve) => checks.set((file as File).name, resolve)),
  );
}
async function answer(name: string, sharpness: Sharpness) {
  await act(async () => checks.get(name)!(sharpness));
}
/** Lets every check answered so far, and every upload chained after one, run. */
const settle = () => act(async () => {});

function setup(
  upload: Mock<Upload> = vi.fn<Upload>(async () => {}),
  replace: Mock<Replace> = vi.fn<Replace>(async () => {}),
) {
  const hook = renderHook(() => useBackgroundRemovalUpload(upload, replace), {
    wrapper,
  });
  return { upload, replace, ...hook };
}

const uploadedNames = (upload: Mock<Upload>) =>
  upload.mock.calls.map(([, { file }]) => file.name);

const turnOn = () => localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  load.loadBackgroundRemoval.mockClear();
  load.loadCutoutReview.mockClear();
  toastError.mockClear();
  toastReportError.mockClear();
  downloadImageObject.mockReset();
  checks.clear();
  assessSharpness.mockReset();
  assessSharpness.mockResolvedValue('sharp');
});

describe('useBackgroundRemovalUpload, with the opt-in off', () => {
  it('uploads a sharp photo once it is checked, with no review and nothing of the model', async () => {
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));
    await settle();

    expect(assessSharpness).toHaveBeenCalledWith(photo);
    expect(upload).toHaveBeenCalledExactlyOnceWith('item-1', { file: photo });
    expect(result.current.pending).toBeNull();
    expect(load.loadBackgroundRemoval).not.toHaveBeenCalled();
    expect(load.loadCutoutReview).not.toHaveBeenCalled();
  });

  it('neither uploads nor asks until the check answers', async () => {
    checkAnswersOnCue();
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));
    await settle();

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('asks about a blurry photo before anything uploads', async () => {
    assessSharpness.mockResolvedValue('blurry');
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));
    await settle();

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toMatchObject({
      file: photo,
      removeBackground: false,
      sharpness: 'blurry',
    });
  });

  it('uploads a blurry photo kept anyway', async () => {
    assessSharpness.mockResolvedValue('blurry');
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));
    await settle();

    await act(async () => result.current.choose({ kind: 'original' }));

    expect(upload).toHaveBeenCalledExactlyOnceWith('item-1', { file: photo });
    expect(result.current.pending).toBeNull();
  });

  it('uploads nothing of a blurry photo skipped, and goes on with the next', async () => {
    checkAnswersOnCue();
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo, second]));
    await answer('coin.jpg', 'blurry');

    await act(async () => result.current.choose({ kind: 'skip' }));
    await answer('medal.jpg', 'sharp');

    expect(uploadedNames(upload)).toEqual(['medal.jpg']);
    expect(result.current.pending).toBeNull();
  });

  it('uploads several sharp photos one after the other, in pick order', async () => {
    const finish: Array<() => void> = [];
    const upload = vi.fn<Upload>(
      () => new Promise<void>((resolve) => finish.push(resolve)),
    );
    const { result } = setup(upload);

    act(() => result.current.pickPhotos('item-1', [photo, second, third]));
    await settle();

    expect(uploadedNames(upload)).toEqual(['coin.jpg']);
    await act(async () => finish[0]());
    expect(uploadedNames(upload)).toEqual(['coin.jpg', 'medal.jpg']);
    await act(async () => finish[1]());
    expect(uploadedNames(upload)).toEqual([
      'coin.jpg',
      'medal.jpg',
      'ring.jpg',
    ]);
  });

  it('keeps pick order around a blurry photo kept in the middle', async () => {
    checkAnswersOnCue();
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo, second, third]));

    await answer('coin.jpg', 'sharp');
    await answer('medal.jpg', 'blurry');
    await act(async () => result.current.choose({ kind: 'original' }));
    await answer('ring.jpg', 'sharp');

    expect(uploadedNames(upload)).toEqual([
      'coin.jpg',
      'medal.jpg',
      'ring.jpg',
    ]);
  });

  it('queues a second pick behind the first rather than dropping it', async () => {
    checkAnswersOnCue();
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));
    act(() => result.current.pickPhotos('item-2', [second]));

    await answer('coin.jpg', 'sharp');
    await answer('medal.jpg', 'sharp');

    expect(upload.mock.calls).toEqual([
      ['item-1', { file: photo }],
      ['item-2', { file: second }],
    ]);
  });

  it('refuses a file that is not an image, once, and goes on with the photos', async () => {
    const { upload, result } = setup();
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    const text = new File(['hi'], 'b.txt', { type: 'text/plain' });

    act(() => result.current.pickPhotos('item-1', [pdf, photo, text]));
    await settle();

    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      'Only photos can be added.',
    );
    expect(uploadedNames(upload)).toEqual(['coin.jpg']);
  });

  it('does nothing more for a pick of no photo at all', async () => {
    const { upload, result } = setup();

    act(() =>
      result.current.pickPhotos('item-1', [
        new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }),
      ]),
    );
    await settle();

    expect(toastError).toHaveBeenCalledOnce();
    expect(assessSharpness).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('useBackgroundRemovalUpload, with the opt-in on', () => {
  beforeEach(turnOn);

  it('opens the review at once, while the check still runs', () => {
    checkAnswersOnCue();
    const { upload, result } = setup();

    act(() => result.current.pickPhotos('item-1', [photo]));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toMatchObject({
      itemId: 'item-1',
      file: photo,
      removeBackground: true,
      position: { current: 1, total: 1 },
      sharpness: 'checking',
    });
  });

  it('passes the verdict on to the review once the check answers', async () => {
    checkAnswersOnCue();
    const { result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));

    await answer('coin.jpg', 'blurry');

    expect(result.current.pending?.sharpness).toBe('blurry');
  });

  // ItemCard's memo keeps an old handler; it must still see a toggle flipped after it was made.
  it('reads the opt-in when a photo is picked, not when the handler was made', () => {
    localStorage.clear();
    const { result } = setup();
    const pickPhotos = result.current.pickPhotos;

    turnOn();
    act(() => pickPhotos('item-1', [photo]));

    expect(result.current.pending?.removeBackground).toBe(true);
  });

  it('uploads the original, unchanged, when that is chosen', async () => {
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));

    await act(async () => result.current.choose({ kind: 'original' }));

    expect(upload).toHaveBeenCalledExactlyOnceWith('item-1', { file: photo });
    expect(result.current.pending).toBeNull();
  });

  it('uploads the cut-out as a PNG that keeps its transparency', async () => {
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));
    const blob = new Blob(['png'], { type: 'image/png' });

    await act(async () => result.current.choose({ kind: 'cut-out', blob }));

    const [itemId, { file, encoding }] = upload.mock.calls[0] as [
      string,
      { file: File; encoding: string },
    ];
    expect(itemId).toBe('item-1');
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('cutout.png');
    expect(await file.text()).toBe('png');
    expect(encoding).toBe('transparent');
  });

  it('uploads nothing of a photo skipped', async () => {
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));

    await act(async () => result.current.choose({ kind: 'skip' }));

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('reviews several one at a time, counting within the pick', async () => {
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo, second, third]));
    expect(result.current.pending?.position).toEqual({ current: 1, total: 3 });

    await act(async () => result.current.choose({ kind: 'original' }));
    expect(result.current.pending).toMatchObject({
      file: second,
      position: { current: 2, total: 3 },
    });

    await act(async () => result.current.choose({ kind: 'skip' }));
    await act(async () => result.current.choose({ kind: 'original' }));

    expect(result.current.pending).toBeNull();
    expect(uploadedNames(upload)).toEqual(['coin.jpg', 'ring.jpg']);
  });

  it('uploads the decided photos in decision order, each after the one before', async () => {
    const finish: Array<() => void> = [];
    const upload = vi.fn<Upload>(
      () => new Promise<void>((resolve) => finish.push(resolve)),
    );
    const { result } = setup(upload);
    act(() => result.current.pickPhotos('item-1', [photo, second]));

    await act(async () => result.current.choose({ kind: 'original' }));
    await act(async () => result.current.choose({ kind: 'original' }));

    expect(uploadedNames(upload)).toEqual(['coin.jpg']);
    await act(async () => finish[0]());
    expect(uploadedNames(upload)).toEqual(['coin.jpg', 'medal.jpg']);
  });

  it('drops the rest of the pick when the review is closed, and nothing of another pick', async () => {
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo, second]));
    localStorage.clear();
    act(() => result.current.pickPhotos('item-2', [third]));

    await act(async () => result.current.choose({ kind: 'cancel' }));
    await settle();

    expect(uploadedNames(upload)).toEqual(['ring.jpg']);
    expect(result.current.pending).toBeNull();
  });

  it('ignores a verdict that comes in after its photo was dropped', async () => {
    checkAnswersOnCue();
    const { upload, result } = setup();
    act(() => result.current.pickPhotos('item-1', [photo]));
    await act(async () => result.current.choose({ kind: 'cancel' }));

    await answer('coin.jpg', 'sharp');

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it('does nothing for a choice with no photo waiting', async () => {
    const { upload, result } = setup();

    await act(async () => result.current.choose({ kind: 'original' }));

    expect(upload).not.toHaveBeenCalled();
  });
});

describe('useBackgroundRemovalUpload, for a photo already stored', () => {
  const stored: ImageEntry = { id: 'image-1', pathFull: 'uid/item-1/a.webp' };
  const bytes = new Blob(['webp'], { type: 'image/webp' });

  it('loads the stored photo and opens its cut-out review, with no blur check', async () => {
    downloadImageObject.mockResolvedValue({ data: bytes, error: null });
    const { result } = setup();

    await act(async () => result.current.reviewStored('item-1', stored));

    expect(downloadImageObject).toHaveBeenCalledWith('uid/item-1/a.webp');
    expect(assessSharpness).not.toHaveBeenCalled();
    expect(result.current.pending).toMatchObject({
      itemId: 'item-1',
      removeBackground: true,
      target: { kind: 'replace', image: stored },
    });
    expect(result.current.pending?.file.type).toBe('image/webp');
    expect(await result.current.pending?.file.text()).toBe('webp');
  });

  it("puts the cut-out in the stored photo's place, never adding one", async () => {
    downloadImageObject.mockResolvedValue({ data: bytes, error: null });
    const { upload, replace, result } = setup();
    await act(async () => result.current.reviewStored('item-1', stored));
    const blob = new Blob(['png'], { type: 'image/png' });

    await act(async () => result.current.choose({ kind: 'cut-out', blob }));

    expect(upload).not.toHaveBeenCalled();
    const [itemId, image, { file, encoding }] = replace.mock.calls[0];
    expect([itemId, image]).toEqual(['item-1', stored]);
    expect(file.name).toBe('cutout.png');
    expect(encoding).toBe('transparent');
    expect(result.current.pending).toBeNull();
  });

  it.each(['original', 'skip', 'cancel'] as const)(
    'leaves the stored photo as it is on %s',
    async (kind) => {
      downloadImageObject.mockResolvedValue({ data: bytes, error: null });
      const { upload, replace, result } = setup();
      await act(async () => result.current.reviewStored('item-1', stored));

      await act(async () => result.current.choose({ kind }));

      expect(upload).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(result.current.pending).toBeNull();
    },
  );

  it('says so, and opens nothing, when the stored photo cannot be loaded', async () => {
    const error = new Error('Object not found');
    downloadImageObject.mockResolvedValue({ data: null, error });
    const { result } = setup();

    await act(async () => result.current.reviewStored('item-1', stored));

    expect(toastReportError).toHaveBeenCalledWith(
      'load photo for background removal',
      error,
      'This photo could not be loaded to remove its background. Please try again.',
    );
    expect(result.current.pending).toBeNull();
  });
});
