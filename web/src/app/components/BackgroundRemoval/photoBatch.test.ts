import { describe, expect, it, vi } from 'vitest';

import {
  afterCurrent,
  positionIn,
  splitImages,
  uploadInOrder,
  type PhotoBatch,
} from './photoBatch';

const file = (name: string, type = 'image/jpeg') =>
  new File(['x'], name, { type });

const batchOf = (files: File[], total = files.length): PhotoBatch => ({
  itemId: 'item-1',
  files,
  total,
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

describe('afterCurrent', () => {
  it('drops the photo just decided on and keeps the rest, with the pick size', () => {
    const [a, b, c] = [file('a.jpg'), file('b.jpg'), file('c.jpg')];

    expect(afterCurrent(batchOf([a, b, c]))).toEqual({
      itemId: 'item-1',
      files: [b, c],
      total: 3,
    });
  });

  it('ends the batch after its last photo', () => {
    expect(afterCurrent(batchOf([file('a.jpg')]))).toBeNull();
  });

  it('ends a batch that is already empty', () => {
    expect(afterCurrent(batchOf([], 2))).toBeNull();
  });

  it('leaves the batch it was given untouched', () => {
    const batch = batchOf([file('a.jpg'), file('b.jpg')]);

    afterCurrent(batch);

    expect(batch.files).toHaveLength(2);
  });
});

describe('positionIn', () => {
  it('counts the photo on screen from 1 within the whole pick', () => {
    const [a, b, c] = [file('a.jpg'), file('b.jpg'), file('c.jpg')];

    expect(positionIn(batchOf([a, b, c]))).toEqual({ current: 1, total: 3 });
    expect(positionIn(batchOf([b, c], 3))).toEqual({ current: 2, total: 3 });
    expect(positionIn(batchOf([c], 3))).toEqual({ current: 3, total: 3 });
  });
});

describe('uploadInOrder', () => {
  it('starts each upload only once the one before it has finished', async () => {
    const log: string[] = [];
    const uploadOne = vi.fn(async (photo: File) => {
      log.push(`start ${photo.name}`);
      await Promise.resolve();
      log.push(`end ${photo.name}`);
    });

    await uploadInOrder([file('a.jpg'), file('b.jpg')], uploadOne);

    expect(log).toEqual([
      'start a.jpg',
      'end a.jpg',
      'start b.jpg',
      'end b.jpg',
    ]);
  });

  it('uploads nothing for an empty pick', async () => {
    const uploadOne = vi.fn(async () => {});

    await uploadInOrder([], uploadOne);

    expect(uploadOne).not.toHaveBeenCalled();
  });
});
