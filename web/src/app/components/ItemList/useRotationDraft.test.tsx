// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoInspection } from '../../lib/photoRotation';
import { ToastWrapper } from '../providers.test-support';
import type { ImageEntry } from './types';
import {
  canSave,
  straighteningOf,
  useRotationDraft,
  type RotationDraft,
  type RotationEdit,
} from './useRotationDraft';

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', () => ({ downloadImageObject }));
const inspectForRotation = vi.hoisted(() =>
  vi.fn<(file: Blob) => Promise<PhotoInspection>>(),
);
vi.mock('../../lib/photoRotation', () => ({ inspectForRotation }));

const image: ImageEntry = {
  id: 'image-1',
  pathFull: 'user/item/photo.webp',
  urlFull: 'https://example.test/photo.webp',
};
const source = new Blob(['stored'], { type: 'image/webp' });
const CUT_OUT: PhotoInspection = {
  transparent: true,
  straightening: { kind: 'straighten', degrees: -3.5 },
};

function renderDraft(
  onSave: (image: ImageEntry, edit: RotationEdit) => Promise<void> = vi.fn(
    async () => {},
  ),
) {
  const hook = renderHook(() => useRotationDraft(onSave), {
    wrapper: ToastWrapper,
  });
  return { ...hook, onSave };
}

function editing(draft: RotationDraft) {
  if (draft.kind !== 'editing') throw new Error('Expected a draft');
  return draft;
}

async function opened(onSave?: () => Promise<void>) {
  const rendered = renderDraft(onSave);
  await act(() => rendered.result.current.start(image));
  return rendered;
}

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  downloadImageObject.mockReset();
  downloadImageObject.mockResolvedValue({ data: source, error: null });
  inspectForRotation.mockReset();
  inspectForRotation.mockResolvedValue(CUT_OUT);
  return () => vi.restoreAllMocks();
});

describe('useRotationDraft', () => {
  it('starts closed', () => {
    expect(renderDraft().result.current.draft).toEqual({ kind: 'closed' });
  });

  it('opens unturned at once, and is ready to save once the stored photo is read and inspected', async () => {
    const { result } = renderDraft();
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(image);
    });
    expect(result.current.draft).toEqual({
      kind: 'editing',
      image,
      rotation: { quarterTurns: 0, angle: 0 },
      inspection: { kind: 'reading' },
      saving: false,
    });

    await act(() => started);

    expect(downloadImageObject).toHaveBeenCalledWith(image.pathFull);
    expect(inspectForRotation).toHaveBeenCalledWith(source);
    expect(editing(result.current.draft).inspection).toEqual({
      kind: 'ready',
      source,
      inspection: CUT_OUT,
    });
  });

  it('closes and says so when the stored photo cannot be downloaded', async () => {
    downloadImageObject.mockResolvedValue({
      data: null,
      error: new Error('Object not found'),
    });
    const { result } = await opened();

    expect(result.current.draft).toEqual({ kind: 'closed' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be loaded to rotate it.',
    );
    expect(inspectForRotation).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'load photo for rotation',
      new Error('Object not found'),
    );
  });

  it('closes and says so when the photo cannot be inspected', async () => {
    inspectForRotation.mockRejectedValue(new Error('Undecodable'));
    const { result } = await opened();

    expect(result.current.draft).toEqual({ kind: 'closed' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('drops a photo read for a rotation cancelled meanwhile', async () => {
    let finish!: (inspection: PhotoInspection) => void;
    inspectForRotation.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderDraft();
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(image);
    });
    act(() => result.current.cancel());

    await act(async () => {
      finish(CUT_OUT);
      await started;
    });

    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('keeps a photo read for a cancelled rotation out of the one opened after it', async () => {
    const answers: ((inspection: PhotoInspection) => void)[] = [];
    inspectForRotation.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    );
    const { result } = renderDraft();
    let first!: Promise<void>;
    act(() => {
      first = result.current.start(image);
    });
    act(() => result.current.cancel());
    act(() => {
      void result.current.start({ ...image, id: 'image-2' });
    });
    await waitFor(() => expect(answers).toHaveLength(2));

    await act(async () => {
      answers[0](CUT_OUT);
      await first;
    });

    expect(editing(result.current.draft).image.id).toBe('image-2');
    expect(editing(result.current.draft).inspection.kind).toBe('reading');
  });

  it('reports nothing for a failure of a rotation cancelled meanwhile', async () => {
    let fail!: (error: Error) => void;
    inspectForRotation.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { result } = renderDraft();
    let started!: Promise<void>;
    act(() => {
      started = result.current.start(image);
    });
    act(() => result.current.cancel());

    await act(async () => {
      fail(new Error('Undecodable'));
      await started;
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a newer rotation’s reading from an older one landing late', async () => {
    const answers: ((inspection: PhotoInspection) => void)[] = [];
    inspectForRotation.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    );
    const { result } = renderDraft();
    let first!: Promise<void>;
    act(() => {
      first = result.current.start(image);
    });
    let second!: Promise<void>;
    act(() => {
      second = result.current.start({ ...image, id: 'image-2' });
    });
    await waitFor(() => expect(answers).toHaveLength(2));

    await act(async () => {
      answers[0](CUT_OUT);
      await first;
    });
    expect(editing(result.current.draft).inspection.kind).toBe('reading');

    await act(async () => {
      answers[1](CUT_OUT);
      await second;
    });
    expect(editing(result.current.draft).image.id).toBe('image-2');
    expect(editing(result.current.draft).inspection.kind).toBe('ready');
  });

  it('adds quarter turns either way and keeps the free angle', async () => {
    const { result } = await opened();

    act(() => result.current.setAngle(12.5));
    act(() => result.current.turn(-1));

    expect(editing(result.current.draft).rotation).toEqual({
      quarterTurns: 3,
      angle: 12.5,
    });

    act(() => result.current.turn(1));
    act(() => result.current.turn(1));
    expect(editing(result.current.draft).rotation.quarterTurns).toBe(1);
  });

  it('resets every turn at once', async () => {
    const { result } = await opened();
    act(() => result.current.turn(1));
    act(() => result.current.setAngle(-7));

    act(() => result.current.reset());

    expect(editing(result.current.draft).rotation).toEqual({
      quarterTurns: 0,
      angle: 0,
    });
  });

  it('ignores turns once closed', () => {
    const { result } = renderDraft();

    act(() => result.current.turn(1));
    act(() => result.current.setAngle(3));
    act(() => result.current.reset());

    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('saves the one turn the quarter turns and the angle add up to, from the photo it read, then closes', async () => {
    const { result, onSave } = await opened();
    act(() => result.current.turn(-1));
    act(() => result.current.setAngle(2.5));

    await act(() => result.current.save());

    expect(onSave).toHaveBeenCalledExactlyOnceWith(image, {
      source,
      degrees: 272.5,
    });
    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('says it is saving while the save is on its way, and is not saved twice', async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await opened(onSave);
    act(() => result.current.turn(1));

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.save();
    });
    expect(editing(result.current.draft).saving).toBe(true);
    await act(() => result.current.save());
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => {
      finish();
      await saving;
    });
    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('closes even when the save throws', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('Lost');
    });
    const { result } = await opened(onSave);
    act(() => result.current.turn(1));

    await act(() => result.current.save().catch(() => {}));

    expect(result.current.draft).toEqual({ kind: 'closed' });
  });

  it('saves nothing while unturned', async () => {
    const { result, onSave } = await opened();

    await act(() => result.current.save());

    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.draft.kind).toBe('editing');
  });
});

describe('canSave', () => {
  const ready = {
    kind: 'editing',
    image,
    rotation: { quarterTurns: 1, angle: 0 },
    inspection: { kind: 'ready', source, inspection: CUT_OUT },
    saving: false,
  } as const;

  it('saves a turned photo once it is read', () => {
    expect(canSave(ready)).toBe(true);
  });

  it('does not save while closed, reading, saving or unturned', () => {
    expect(canSave({ kind: 'closed' })).toBe(false);
    expect(canSave({ ...ready, inspection: { kind: 'reading' } })).toBe(false);
    expect(canSave({ ...ready, saving: true })).toBe(false);
    expect(canSave({ ...ready, rotation: { quarterTurns: 0, angle: 0 } })).toBe(
      false,
    );
  });
});

describe('straighteningOf', () => {
  const draft = {
    kind: 'editing',
    image,
    rotation: { quarterTurns: 0, angle: 0 },
    saving: false,
  } as const;

  it('offers what the inspection found once the photo is read', () => {
    expect(
      straighteningOf({
        ...draft,
        inspection: { kind: 'ready', source, inspection: CUT_OUT },
      }),
    ).toEqual({ kind: 'straighten', degrees: -3.5 });
  });

  it('offers nothing while the photo is read', () => {
    expect(
      straighteningOf({ ...draft, inspection: { kind: 'reading' } }),
    ).toEqual({ kind: 'none' });
  });
});
