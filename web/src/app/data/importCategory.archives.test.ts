import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import { ImportFormatError } from './importFormat';
import {
  baseFakes,
  buildRepackedArchive,
  fakeCreateCategory,
  fakeDeleteCategory,
  fakeRemoveImages,
  fakeUploadImage,
} from './importCategory.test-support';
import { craftZip } from './zipReader.test-support';

// #787: what an archive can be besides the byte-for-byte file the export downloaded.
describe('importCategory, on an export packed again by a zip tool', () => {
  it('imports every entry and photograph, byte for byte', async () => {
    const photo = new Uint8Array(4096).map((_, i) => i % 13);
    const createCategoryRow = fakeCreateCategory();
    const uploadImage = fakeUploadImage();

    const result = await importCategory({
      file: buildRepackedArchive({ photo }),
      nameCategory: (name) => name,
      ...baseFakes(),
      createCategoryRow,
      uploadImage,
    });

    expect(result).toMatchObject({
      itemCount: 1,
      photoCount: 1,
      skippedPhotoCount: 0,
    });
    expect(createCategoryRow).toHaveBeenCalledWith('Coins');
    const [[path, uploaded]] = (uploadImage as ReturnType<typeof vi.fn>).mock
      .calls as [string, Blob][];
    expect(path).toMatch(/\.jpg$/);
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(photo);
  });
});

// Zipping the unzipped folder's contents rather than the folder leaves collection.json at the root.
describe('importCategory, on an export whose contents were zipped without their folder', () => {
  it('imports every entry and photograph, byte for byte', async () => {
    const photo = new Uint8Array(4096).map((_, i) => i % 7);
    const createCategoryRow = fakeCreateCategory();
    const uploadImage = fakeUploadImage();

    const result = await importCategory({
      file: buildRepackedArchive({ photo, prefix: '' }),
      nameCategory: (name) => name,
      ...baseFakes(),
      createCategoryRow,
      uploadImage,
    });

    expect(result).toMatchObject({
      itemCount: 1,
      photoCount: 1,
      skippedPhotoCount: 0,
    });
    expect(createCategoryRow).toHaveBeenCalledWith('Coins');
    const [[, uploaded]] = (uploadImage as ReturnType<typeof vi.fn>).mock
      .calls as [string, Blob][];
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(photo);
  });
});

describe('importCategory, refusing an archive before it creates anything', () => {
  async function refusal(file: Blob) {
    const createCategoryRow = fakeCreateCategory();
    const failure = importCategory({
      file,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      createCategoryRow,
    });
    const error = await failure.then(
      () => expect.fail('the import went through'),
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ImportFormatError);
    expect(createCategoryRow).not.toHaveBeenCalled();
    return error as ImportFormatError;
  }

  it('calls a file that is no ZIP at all unreadable, not a reason to try again', async () => {
    const error = await refusal(new Blob(['not a zip']));
    expect(error.reason).toBe('unreadable');
    expect(error.cause).toHaveProperty('name', 'ZipReadError');
  });

  it('calls an archive that declares more than an import inflates too large', async () => {
    const error = await refusal(
      buildRepackedArchive({
        change: (entry) =>
          entry.name.endsWith('collection.json')
            ? { ...entry, central: { size: 200 * 1024 * 1024 } }
            : entry,
      }),
    );
    expect(error.reason).toBe('too_large');
    expect(error.message).toMatch(/entry limit/);
    expect(error.cause).toHaveProperty('name', 'ZipLimitError');
  });

  it('calls a manifest that fails its checksum unreadable', async () => {
    const error = await refusal(
      buildRepackedArchive({
        change: (entry) =>
          entry.name.endsWith('collection.json')
            ? { ...entry, central: { crc: 1 } }
            : entry,
      }),
    );
    expect(error.reason).toBe('unreadable');
    expect(error.message).toMatch(/checksum/);
  });

  it('calls a manifest entry without its photographs not an export', async () => {
    const manifest = {
      format: 'collectionbuddy-category-export',
      version: 1,
      category: { name: 'Coins' },
      items: [{ title: 'Dime', description: null, place: null, tags: [] }],
    };
    const error = await refusal(
      new Blob([
        craftZip({
          entries: [
            {
              name: 'root/collection.json',
              data: new TextEncoder().encode(JSON.stringify(manifest)),
            },
          ],
        }),
      ]),
    );
    expect(error.reason).toBe('not_export');
    expect(error.message).toMatch(/malformed entry/);
  });

  it('calls a manifest that is no JSON not an export, keeping the parse error', async () => {
    const error = await refusal(
      new Blob([
        craftZip({
          entries: [
            {
              name: 'root/collection.json',
              data: new TextEncoder().encode('{not json'),
            },
          ],
        }),
      ]),
    );
    expect(error.reason).toBe('not_export');
    expect(error.message).toBe(
      'Could not read collection.json in this archive',
    );
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it('checks a manifest at the archive root against its checksum too', async () => {
    const error = await refusal(
      buildRepackedArchive({
        prefix: '',
        change: (entry) =>
          entry.name === 'collection.json'
            ? { ...entry, central: { crc: 1 } }
            : entry,
      }),
    );
    expect(error.reason).toBe('unreadable');
    expect(error.message).toMatch(/checksum/);
  });

  it('calls an archive holding the export both in its folder and at its root not an export', async () => {
    const manifest = new TextEncoder().encode('{}');
    const error = await refusal(
      new Blob([
        craftZip({
          entries: [
            { name: 'collection.json', data: manifest },
            { name: 'root/collection.json', data: manifest },
          ],
        }),
      ]),
    );
    expect(error.reason).toBe('not_export');
    expect(error.message).toBe('More than one collection.json in this archive');
  });

  it('calls an archive with no manifest not an export', async () => {
    const error = await refusal(
      new Blob([
        craftZip({
          entries: [{ name: 'root/a.txt', data: new Uint8Array(1) }],
        }),
      ]),
    );
    expect(error.reason).toBe('not_export');
  });
});

describe('importCategory, on a photograph the archive lies about', () => {
  // Found only once the photograph is read; the import stays all or nothing.
  it('removes what it uploaded and the category, and calls the archive unreadable', async () => {
    const uploadImage = fakeUploadImage();
    const removeImages = fakeRemoveImages();
    const deleteCategoryRow = fakeDeleteCategory();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const file = buildRepackedArchive({
      change: (entry) =>
        entry.name.endsWith('.jpg')
          ? { ...entry, central: { size: 2 } }
          : entry,
    });

    const failure = importCategory({
      file,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      uploadImage,
      removeImages,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toMatchObject({
      name: 'ImportFormatError',
      reason: 'unreadable',
    });
    await expect(failure).rejects.toThrow(/inflates past its declared size/);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(deleteCategoryRow).toHaveBeenCalledWith('new-cat-1');
    expect(consoleError).not.toHaveBeenCalledWith(
      'Skipping photograph',
      expect.anything(),
      expect.anything(),
    );
    consoleError.mockRestore();
  });
});
