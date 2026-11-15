// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoUpload } from '../../data/photoType';
import type {
  Crop,
  CropResult,
  CutOutOptions,
} from '../../lib/backgroundRemoval';
import { ToastWrapper } from '../providers.test-support';
import type { ImageEntry } from './types';
import {
  stageOf,
  uploadOf,
  useCropDraft,
  type CropDraft,
} from './useCropDraft';

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', () => ({ downloadImageObject }));

class NoObjectFoundError extends Error {}
const cropToObject = vi.hoisted(() =>
  vi.fn<(file: Blob, options: CutOutOptions) => Promise<CropResult>>(),
);
vi.mock('../BackgroundRemoval/load', () => ({
  loadBackgroundRemoval: async () => ({ cropToObject, NoObjectFoundError }),
}));

const image: ImageEntry = {
  id: 'image-1',
  pathFull: 'user/item/photo.webp',
  urlFull: 'https://example.test/photo.webp',
};
const source = new Blob(['stored'], { type: 'image/webp' });
const crop: Crop = {
  blob: new Blob(['png'], { type: 'image/png' }),
  width: 400,
  height: 300,
  transparent: false,
};
const createObjectURL = vi.fn(() => 'blob:crop');
const revokeObjectURL = vi.fn();

function renderDraft(
  onSave: (image: ImageEntry, photo: PhotoUpload) => Promise<void> = vi.fn(
    async () => {},
  ),
) {
  const hook = renderHook(() => useCropDraft(onSave), {
    wrapper: ToastWrapper,
  });
  return { ...hook, onSave };
}

async function started(onSave?: () => Promise<void>) {
  const rendered = renderDraft(onSave);
  await act(() => rendered.result.current.start(image));
  return rendered;
}

const kindOf = (draft: CropDraft) => draft.kind;

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  downloadImageObject.mockReset();
  downloadImageObject.mockResolvedValue({ data: source, error: null });
  cropToObject.mockReset();
  cropToObject.mockResolvedValue({ kind: 'cropped', crop });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stageOf', () => {
  it('reads a download’s progress as a whole percent', () => {
    expect(stageOf({ stage: 'download', loaded: 30, total: 120 })).toEqual({
      kind: 'downloading',
      percent: 25,
    });
  });

  it('reads the model at work as finding the item', () => {
    expect(stageOf({ stage: 'analyze' })).toEqual({ kind: 'finding' });
  });
});

describe('uploadOf', () => {
  it('uploads an opaque crop as an opaque PNG', async () => {
    const upload = uploadOf(crop);
    expect(upload.encoding).toBe('opaque');
    expect(upload.file.name).toBe('cropped.png');
    expect(upload.file.type).toBe('image/png');
    expect(await upload.file.text()).toBe('png');
  });

  it('keeps a cut-out see-through', () => {
    expect(uploadOf({ ...crop, transparent: true }).encoding).toBe(
      'transparent',
    );
  });
});

describe('useCropDraft', () => {
  it('starts closed', () => {
    expect(renderDraft().result.current.draft).toEqual({ kind: 'closed' });
  });

  it('reads the stored photo, follows the worker’s progress, then shows the crop', async () => {
    let report!: CutOutOptions['onProgress'];
    let finish!: (result: CropResult) => void;
    cropToObject.mockImplementation((_file, options) => {
      report = options.onProgress;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { result } = renderDraft();

    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start(image);
    });
    expect(result.current.draft).toEqual({
      kind: 'working',
      image,
      stage: { kind: 'reading' },
    });

    await vi.waitFor(() => expect(cropToObject).toHaveBeenCalled());
    expect(cropToObject.mock.calls[0][0]).toBe(source);
    expect(downloadImageObject).toHaveBeenCalledWith(image.pathFull);
    act(() => report!({ stage: 'download', loaded: 1, total: 2 }));
    expect(result.current.draft).toMatchObject({
      stage: { kind: 'downloading', percent: 50 },
    });
    act(() => report!({ stage: 'analyze' }));
    expect(result.current.draft).toMatchObject({ stage: { kind: 'finding' } });

    await act(async () => {
      finish({ kind: 'cropped', crop });
      await starting;
    });
    expect(result.current.draft).toEqual({
      kind: 'ready',
      image,
      crop,
      previewUrl: 'blob:crop',
      saving: false,
    });
    expect(createObjectURL).toHaveBeenCalledWith(crop.blob);
  });

  it('says so when the photo is framed round its item already', async () => {
    cropToObject.mockResolvedValue({ kind: 'already-framed' });
    const { result } = await started();

    expect(result.current.draft).toEqual({
      kind: 'unchanged',
      image,
      reason: 'already-framed',
    });
  });

  it('says so when no item is found', async () => {
    cropToObject.mockRejectedValue(new NoObjectFoundError());
    const { result } = await started();

    expect(result.current.draft).toEqual({
      kind: 'unchanged',
      image,
      reason: 'no-object',
    });
  });

  it('closes and says so when the stored photo cannot be downloaded', async () => {
    downloadImageObject.mockResolvedValue({
      data: null,
      error: new Error('Object not found'),
    });
    const { result } = await started();

    expect(result.current.draft).toEqual({ kind: 'closed' });
    expect(cropToObject).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be loaded to crop it.',
    );
    expect(console.error).toHaveBeenCalledWith(
      'crop photo',
      new Error('Object not found'),
    );
  });

  it('closes and says so when the crop fails', async () => {
    cropToObject.mockRejectedValue(new Error('Model failed'));
    const { result } = await started();

    expect(result.current.draft).toEqual({ kind: 'closed' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be cropped. The original is unchanged',
    );
  });

  it('stops the worker on Cancel, and reports nothing of a crop it stopped', async () => {
    let options!: CutOutOptions;
    cropToObject.mockImplementation((_file, given) => {
      options = given;
      return new Promise((_resolve, reject) =>
        given.signal!.addEventListener('abort', () =>
          reject(new Error('Aborted')),
        ),
      );
    });
    const { result } = renderDraft();
    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start(image);
    });
    await vi.waitFor(() => expect(cropToObject).toHaveBeenCalled());

    await act(async () => {
      result.current.cancel();
      await starting;
    });

    expect(options.signal!.aborted).toBe(true);
    expect(result.current.draft).toEqual({ kind: 'closed' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('drops a download that lands after Cancel', async () => {
    let downloaded!: (value: unknown) => void;
    downloadImageObject.mockReturnValue(
      new Promise((resolve) => {
        downloaded = resolve;
      }),
    );
    const { result } = renderDraft();
    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start(image);
    });
    act(() => result.current.cancel());

    await act(async () => {
      downloaded({ data: source, error: null });
      await starting;
    });

    expect(cropToObject).not.toHaveBeenCalled();
    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('stops an earlier crop when another starts', async () => {
    const signals: AbortSignal[] = [];
    cropToObject.mockImplementation((_file, options) => {
      signals.push(options.signal!);
      return new Promise(() => {});
    });
    const { result } = renderDraft();
    act(() => {
      void result.current.start(image);
    });
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    act(() => {
      void result.current.start({ ...image, id: 'image-2' });
    });

    expect(signals[0].aborted).toBe(true);
  });

  it('stops a crop still working when the page goes', async () => {
    let signal!: AbortSignal;
    cropToObject.mockImplementation((_file, options) => {
      signal = options.signal!;
      return new Promise(() => {});
    });
    const { result, unmount } = renderDraft();
    act(() => {
      void result.current.start(image);
    });
    await vi.waitFor(() => expect(cropToObject).toHaveBeenCalled());

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('saves the crop as an upload, then closes and lets go of its preview', async () => {
    const { result, onSave } = await started();

    await act(() => result.current.save());

    expect(onSave).toHaveBeenCalledExactlyOnceWith(image, uploadOf(crop));
    expect(kindOf(result.current.draft)).toBe('closed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:crop');
  });

  it('says it is saving meanwhile, and does not save twice', async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await started(onSave);

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.save();
    });
    expect(result.current.draft).toMatchObject({ saving: true });
    await act(() => result.current.save());
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => {
      finish();
      await saving;
    });
    expect(kindOf(result.current.draft)).toBe('closed');
  });

  it('closes even when the save throws', async () => {
    const { result } = await started(async () => {
      throw new Error('Lost');
    });

    await act(() => result.current.save().catch(() => {}));

    expect(kindOf(result.current.draft)).toBe('closed');
  });

  it('saves nothing before the crop is ready', async () => {
    cropToObject.mockResolvedValue({ kind: 'already-framed' });
    const { result, onSave } = await started();

    await act(() => result.current.save());

    expect(onSave).not.toHaveBeenCalled();
    expect(kindOf(result.current.draft)).toBe('unchanged');
  });
});
