import { describe, expect, it, vi } from 'vitest';

import { importCategory, type ImportProgress } from './importCategory';
import { ImportFormatError } from './importFormat';
import { createZipWriter } from './zip';
import {
  type CreateCategoryRow,
  buildArchive,
  fakeGetUid,
  fakeCreateCategory,
  fakeDeleteCategory,
  baseFakes,
} from './importCategory.test-support';

describe('importCategory', () => {
  it('throws a named ImportError rather than importing when there is no session', async () => {
    const archive = await buildArchive();
    const failure = importCategory({
      file: archive,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      getUid: fakeGetUid(null),
    });
    await expect(failure).rejects.toThrow('No user session');
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
  });

  it('rejects a file that is not a ZIP archive at all', async () => {
    const failure = importCategory({
      file: new Blob(['not a zip']),
      nameCategory: () => 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not read this file as a ZIP archive',
    );
    await expect(failure).rejects.toHaveProperty('cause');
  });

  it('rejects an archive with no collection.json', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'root/photos/1.webp', bytes: new Uint8Array([1]) });
    const failure = importCategory({
      file: writer.finish(),
      nameCategory: () => 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Not a CollectionBuddy export archive',
    );
  });

  it("rejects an archive whose manifest is not this app's format", async () => {
    const writer = createZipWriter();
    const encoder = new TextEncoder();
    writer.add({
      path: 'root/collection.json',
      bytes: encoder.encode(JSON.stringify({ format: 'something-else' })),
    });
    const failure = importCategory({
      file: writer.finish(),
      nameCategory: () => 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
    // Rethrown as-is: the generic "could not read collection.json" would mean the catch-all branch.
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Not a CollectionBuddy export archive',
    );
  });

  it('rejects an archive whose collection.json is not valid JSON', async () => {
    const writer = createZipWriter();
    const encoder = new TextEncoder();
    writer.add({
      path: 'root/collection.json',
      bytes: encoder.encode('{not json'),
    });
    const failure = importCategory({
      file: writer.finish(),
      nameCategory: () => 'Coins',
      ...baseFakes(),
    });
    await expect(failure).rejects.toBeInstanceOf(ImportFormatError);
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not read collection.json in this archive',
    );
  });

  it("creates the new category under the name nameCategory makes of the archive's own", async () => {
    const archive = await buildArchive();
    const createCategoryRow = fakeCreateCategory();
    const nameCategory = vi.fn((archivedName: string) => `${archivedName} (2)`);
    await importCategory({
      file: archive,
      nameCategory,
      ...baseFakes(),
      createCategoryRow,
    });
    expect(nameCategory).toHaveBeenCalledWith('Coins');
    expect(createCategoryRow).toHaveBeenCalledWith('Coins (2)');
  });

  it('does not touch the category at all when creating it fails -- nothing to clean up', async () => {
    const archive = await buildArchive();
    const categoryError = new Error('duplicate name');
    const createCategoryRow = vi.fn(async () => ({
      data: null,
      error: categoryError,
    })) as unknown as CreateCategoryRow;
    const deleteCategoryRow = fakeDeleteCategory();

    const failure = importCategory({
      file: archive,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      createCategoryRow,
      deleteCategoryRow,
    });

    await expect(failure).rejects.toHaveProperty('name', 'ImportError');
    await expect(failure).rejects.toHaveProperty(
      'message',
      'Could not create category',
    );
    await expect(failure).rejects.toHaveProperty('cause', categoryError);
    expect(deleteCategoryRow).not.toHaveBeenCalled();
  });

  it('treats a missing category row as a failure even without an explicit error', async () => {
    const archive = await buildArchive();
    const createCategoryRow = vi.fn(async () => ({
      data: null,
      error: null,
    })) as unknown as CreateCategoryRow;

    const failure = importCategory({
      file: archive,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      createCategoryRow,
    });

    await expect(failure).rejects.toThrow('Could not create category');
  });

  it('reports progress through reading, items and photos', async () => {
    const archive = await buildArchive();
    const progress: ImportProgress[] = [];
    await importCategory({
      file: archive,
      nameCategory: () => 'Coins',
      ...baseFakes(),
      onProgress: (step) => progress.push(step),
    });

    // One item, one photo: deterministic, so the whole sequence is pinned, `done`/`total` included.
    expect(progress).toEqual([
      { phase: 'reading', done: 0, total: 0 },
      { phase: 'items', done: 0, total: 1 },
      { phase: 'items', done: 1, total: 1 },
      { phase: 'photos', done: 0, total: 1 },
      { phase: 'photos', done: 1, total: 1 },
    ]);
  });
});
