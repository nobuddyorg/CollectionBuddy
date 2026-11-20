// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoUpload } from '../../data/photoType';
import { ToastWrapper } from '../providers.test-support';
import type { ImageEntry } from './types';
import { useManualCrop, type ManualCrop } from './useManualCrop';

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', () => ({ downloadImageObject }));
const cropPhotoToFrame = vi.hoisted(() => vi.fn());
vi.mock('../../lib/photoFrameCrop', () => ({ cropPhotoToFrame }));

const image: ImageEntry = {
  id: 'image-1',
  pathFull: 'user/item/photo.webp',
  urlFull: 'https://example.test/photo.webp',
};
const SIZE = { width: 1000, height: 600 };
const stored = new Blob(['stored'], { type: 'image/webp' });
const cropped: PhotoUpload = {
  file: new File(['png'], 'cropped.png', { type: 'image/png' }),
  encoding: 'opaque',
};

type Framing = Extract<ManualCrop, { kind: 'framing' }>;
const framing = (crop: ManualCrop): Framing => {
  if (crop.kind !== 'framing')
    throw new Error(`expected framing: ${crop.kind}`);
  return crop;
};

function renderCrop(
  onSave = vi.fn<(image: ImageEntry, photo: PhotoUpload) => Promise<void>>(
    async () => {},
  ),
) {
  const hook = renderHook(() => useManualCrop(onSave), {
    wrapper: ToastWrapper,
  });
  act(() => hook.result.current.start(image, SIZE));
  return { ...hook, onSave };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  downloadImageObject.mockResolvedValue({ data: stored, error: null });
  cropPhotoToFrame.mockResolvedValue(cropped);
});

describe('useManualCrop', () => {
  it('is closed until started', () => {
    const { result } = renderHook(() => useManualCrop(vi.fn()), {
      wrapper: ToastWrapper,
    });

    expect(result.current.crop).toEqual({ kind: 'closed' });
  });

  // A crop made for the cover should show whole on the card's 4:3.
  it('starts on the photo it was opened on, locked to 4:3, centred', () => {
    const { result } = renderCrop();

    expect(result.current.crop).toEqual({
      kind: 'framing',
      image,
      size: SIZE,
      frame: { x: 140, y: 30, width: 720, height: 540 },
      locked: true,
      saving: false,
    });
  });

  it('moves the frame from where a drag began, not by each step on top of the last', () => {
    const { result } = renderCrop();
    const from = framing(result.current.crop).frame;

    act(() => result.current.move(from, { x: 10, y: 0 }));
    act(() => result.current.move(from, { x: 20, y: 0 }));

    expect(framing(result.current.crop).frame.x).toBe(160);
  });

  it('resizes from a corner, at 4:3 while locked', () => {
    const { result } = renderCrop();
    const from = framing(result.current.crop).frame;

    act(() =>
      result.current.resize(from, 'bottom-right', { x: -120, y: -500 }),
    );

    expect(framing(result.current.crop).frame).toEqual({
      x: 140,
      y: 30,
      width: 600,
      height: 450,
    });
  });

  it('resizes freely once the lock is off, and turning it on again shrinks the frame to 4:3', () => {
    const { result } = renderCrop();

    act(() => result.current.toggleLock());
    expect(framing(result.current.crop).locked).toBe(false);
    const from = framing(result.current.crop).frame;
    act(() => result.current.resize(from, 'bottom-right', { x: 0, y: -240 }));
    expect(framing(result.current.crop).frame).toEqual({
      x: 140,
      y: 30,
      width: 720,
      height: 300,
    });

    act(() => result.current.toggleLock());

    expect(framing(result.current.crop)).toMatchObject({
      locked: true,
      frame: { x: 300, y: 30, width: 400, height: 300 },
    });
  });

  it('cancels without touching the photo', () => {
    const { result, onSave } = renderCrop();

    act(() => result.current.cancel());

    expect(result.current.crop).toEqual({ kind: 'closed' });
    expect(downloadImageObject).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('crops the stored photo to the frame in whole pixels, and hands the crop on to be saved', async () => {
    const { result, onSave } = renderCrop();
    const from = framing(result.current.crop).frame;
    act(() => result.current.move(from, { x: 0.4, y: -0.6 }));

    await act(() => result.current.save());

    expect(downloadImageObject).toHaveBeenCalledWith(image.pathFull);
    expect(cropPhotoToFrame).toHaveBeenCalledWith(stored, {
      x: 140,
      y: 29,
      width: 720,
      height: 540,
    });
    expect(onSave).toHaveBeenCalledWith(image, cropped);
    expect(result.current.crop).toEqual({ kind: 'closed' });
  });

  it('holds the frame still while saving, and saves only once', async () => {
    let release!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderCrop(onSave);
    const from = framing(result.current.crop).frame;

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.save();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(framing(result.current.crop).saving).toBe(true);
    act(() => result.current.move(from, { x: 50, y: 0 }));
    act(() => result.current.toggleLock());
    await act(() => result.current.save());

    expect(framing(result.current.crop)).toMatchObject({
      frame: from,
      locked: true,
    });
    expect(downloadImageObject).toHaveBeenCalledOnce();
    await act(async () => {
      release();
      await saving;
    });
    expect(result.current.crop).toEqual({ kind: 'closed' });
  });

  it('says so, and keeps the original, when the stored photo cannot be loaded', async () => {
    downloadImageObject.mockResolvedValue({
      data: null,
      error: new Error('offline'),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result, onSave } = renderCrop();

    await act(() => result.current.save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be loaded to crop it. Please try again.',
    );
    expect(cropPhotoToFrame).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.crop).toEqual({ kind: 'closed' });
    consoleError.mockRestore();
  });

  it('says so, and keeps the original, when the crop itself fails', async () => {
    cropPhotoToFrame.mockRejectedValue(new Error('no canvas'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result, onSave } = renderCrop();

    await act(() => result.current.save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be cropped. The original is unchanged; please try again.',
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.crop).toEqual({ kind: 'closed' });
    consoleError.mockRestore();
  });

  it('does nothing on save or a change while closed', async () => {
    const { result, onSave } = renderCrop();
    act(() => result.current.cancel());

    act(() => result.current.toggleLock());
    act(() =>
      result.current.move({ x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 1 }),
    );
    await act(() => result.current.save());

    expect(result.current.crop).toEqual({ kind: 'closed' });
    expect(onSave).not.toHaveBeenCalled();
  });
});
