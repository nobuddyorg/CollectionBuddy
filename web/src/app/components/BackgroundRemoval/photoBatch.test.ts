import { describe, expect, it } from 'vitest';

import {
  enqueuePick,
  enqueueStored,
  judged,
  nextStep,
  splitImages,
  withoutHead,
  withoutPick,
  type QueuedPhoto,
} from './photoBatch';

const file = (name: string, type = 'image/jpeg') =>
  new File(['x'], name, { type });

const pickOf = (
  pick: number,
  files: File[],
  { itemId = 'item-1', removeBackground = false } = {},
) => ({ pick, itemId, files, removeBackground });

const photo = (overrides: Partial<QueuedPhoto> = {}): QueuedPhoto => ({
  key: '1:0',
  pick: 1,
  itemId: 'item-1',
  file: file('a.jpg'),
  removeBackground: false,
  position: { current: 1, total: 1 },
  sharpness: 'checking',
  target: { kind: 'new' },
  ...overrides,
});

describe('splitImages', () => {
  it('keeps the images in the order they were picked and counts the rest', () => {
    const first = file('a.jpg');
    const second = file('b.png', 'image/png');

    expect(
      splitImages([
        first,
        file('c.pdf', 'application/pdf'),
        second,
        file('d.txt', 'text/plain'),
      ]),
    ).toEqual({ images: [first, second], skipped: 2 });
  });

  it('skips nothing when everything is an image', () => {
    expect(splitImages([file('a.jpg')]).skipped).toBe(0);
  });

  it('treats a file with no type as not an image', () => {
    expect(splitImages([file('a', '')])).toEqual({ images: [], skipped: 1 });
  });

  it('answers an empty pick with an empty result', () => {
    expect(splitImages([])).toEqual({ images: [], skipped: 0 });
  });
});

describe('enqueuePick', () => {
  it('queues a pick in its order, numbered within the pick, each still to be checked', () => {
    const [a, b] = [file('a.jpg'), file('b.jpg')];

    expect(
      enqueuePick(
        [],
        pickOf(3, [a, b], { itemId: 'item-9', removeBackground: true }),
      ),
    ).toEqual([
      {
        key: '3:0',
        pick: 3,
        itemId: 'item-9',
        file: a,
        removeBackground: true,
        position: { current: 1, total: 2 },
        sharpness: 'checking',
        target: { kind: 'new' },
      },
      {
        key: '3:1',
        pick: 3,
        itemId: 'item-9',
        file: b,
        removeBackground: true,
        position: { current: 2, total: 2 },
        sharpness: 'checking',
        target: { kind: 'new' },
      },
    ]);
  });

  it('puts a later pick after the photos already waiting', () => {
    const first = enqueuePick([], pickOf(1, [file('a.jpg')]));
    const both = enqueuePick(first, pickOf(2, [file('b.jpg')]));

    expect(both.map((waiting) => waiting.key)).toEqual(['1:0', '2:0']);
  });

  it('keys the same file picked twice apart', () => {
    const same = file('a.jpg');
    const queue = enqueuePick([], pickOf(1, [same, same]));

    expect(new Set(queue.map((waiting) => waiting.key)).size).toBe(2);
  });
});

describe('enqueueStored', () => {
  const stored = { id: 'image-1', pathFull: 'uid/item-1/a.webp' };

  it('queues a stored photo for its cut-out review alone, as sharp as it was judged when added', () => {
    const photoFile = file('photo');

    expect(
      enqueueStored([], {
        pick: 4,
        itemId: 'item-1',
        image: stored,
        file: photoFile,
      }),
    ).toEqual([
      {
        key: '4:0',
        pick: 4,
        itemId: 'item-1',
        file: photoFile,
        removeBackground: true,
        position: { current: 1, total: 1 },
        sharpness: 'sharp',
        target: { kind: 'replace', image: stored },
      },
    ]);
  });

  it('puts it after the photos already waiting', () => {
    const waiting = enqueuePick([], pickOf(1, [file('a.jpg')]));

    const queue = enqueueStored(waiting, {
      pick: 2,
      itemId: 'item-1',
      image: stored,
      file: file('photo'),
    });

    expect(queue.map((photo) => photo.key)).toEqual(['1:0', '2:0']);
  });

  it('is always reviewed, never uploaded on its own', () => {
    const [queued] = enqueueStored([], {
      pick: 1,
      itemId: 'item-1',
      image: stored,
      file: file('photo'),
    });

    expect(nextStep(queued)).toBe('ask');
  });
});

describe('withoutHead', () => {
  it('drops the photo at the head', () => {
    const queue = enqueuePick([], pickOf(1, [file('a.jpg'), file('b.jpg')]));

    expect(withoutHead(queue, queue[0])).toEqual([queue[1]]);
  });

  it('leaves the queue alone once that photo is no longer at the head', () => {
    const queue = enqueuePick([], pickOf(1, [file('a.jpg'), file('b.jpg')]));

    expect(withoutHead(queue, queue[1])).toBe(queue);
    expect(withoutHead([], queue[0])).toEqual([]);
  });
});

describe('withoutPick', () => {
  it('drops what is left of one pick and keeps the others', () => {
    const queue = enqueuePick(
      enqueuePick([], pickOf(1, [file('a.jpg'), file('b.jpg')])),
      pickOf(2, [file('c.jpg')]),
    );

    expect(withoutPick(queue, 1).map((waiting) => waiting.key)).toEqual([
      '2:0',
    ]);
  });
});

describe('judged', () => {
  it('records the verdict on that photo only', () => {
    const queue = enqueuePick([], pickOf(1, [file('a.jpg'), file('b.jpg')]));

    const after = judged(queue, queue[0], 'blurry');

    expect(after.map((waiting) => waiting.sharpness)).toEqual([
      'blurry',
      'checking',
    ]);
  });

  it('leaves the queue as it was when that photo is gone', () => {
    const queue = enqueuePick([], pickOf(1, [file('a.jpg')]));

    expect(judged(queue, photo({ key: '9:0' }), 'sharp')).toEqual(queue);
  });
});

describe('nextStep', () => {
  it('waits for the check before a photo with no review goes anywhere', () => {
    expect(nextStep(photo({ sharpness: 'checking' }))).toBe('wait');
  });

  it('uploads a sharp photo straight away', () => {
    expect(nextStep(photo({ sharpness: 'sharp' }))).toBe('upload');
  });

  it('asks about a blurry photo', () => {
    expect(nextStep(photo({ sharpness: 'blurry' }))).toBe('ask');
  });

  it('always asks for a cut-out, checked or not', () => {
    for (const sharpness of ['checking', 'sharp', 'blurry'] as const) {
      expect(nextStep(photo({ removeBackground: true, sharpness }))).toBe(
        'ask',
      );
    }
  });
});
