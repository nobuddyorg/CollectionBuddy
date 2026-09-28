import { deflateRawSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import { ZipLimitError } from './zip';
import { ZIP_READ_LIMITS } from './zipDirectory';
import { inflateExactly } from './zipReader';
import { craftZip, JSON_BYTES, limits, open } from './zipReader.test-support';

const encoder = new TextEncoder();

describe('inflateExactly', () => {
  // A bomb: megabytes of zeros in a few kilobytes, claiming a tiny size.
  it('cancels inflating the moment the output passes the declared size', async () => {
    const cancel = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
    const bomb = new Blob([deflateRawSync(new Uint8Array(20_000_000))]);
    try {
      await expect(
        inflateExactly(bomb, { size: 1000, name: 'bomb' }),
      ).rejects.toThrow(/"bomb" inflates past its declared size/);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      cancel.mockRestore();
    }
  });

  it('returns exactly the declared bytes', async () => {
    const out = await inflateExactly(new Blob([deflateRawSync(JSON_BYTES)]), {
      size: JSON_BYTES.length,
      name: 'a',
    });
    expect(out).toEqual(JSON_BYTES);
  });
});

describe('openZip, against the read limits', () => {
  const two = craftZip({
    entries: [
      { name: 'a', data: encoder.encode('1'), method: 'store' },
      { name: 'b', data: encoder.encode('2'), method: 'store' },
    ],
  });

  it('allows exactly the entry limit and refuses one more', async () => {
    await expect(open(two, limits({ maxEntries: 2 }))).resolves.toHaveProperty(
      'size',
      2,
    );
    const failure = open(two, limits({ maxEntries: 1 }));
    await expect(failure).rejects.toBeInstanceOf(ZipLimitError);
    await expect(failure).rejects.toThrow(/more than 1 entries/);
  });

  it('counts every entry, stored or not, towards the total', async () => {
    await expect(
      open(two, limits({ maxTotalBytes: 2 })),
    ).resolves.toBeDefined();
    await expect(open(two, limits({ maxTotalBytes: 1 }))).rejects.toThrow(
      /past the total limit/,
    );
  });

  it('refuses a deflated entry that declares more than one entry may inflate to, before inflating it', async () => {
    const bytes = craftZip({ entries: [{ name: 'a', data: JSON_BYTES }] });
    const size = JSON_BYTES.length;
    await expect(
      open(bytes, limits({ maxInflatedEntryBytes: size })),
    ).resolves.toBeDefined();
    const failure = open(bytes, limits({ maxInflatedEntryBytes: size - 1 }));
    await expect(failure).rejects.toBeInstanceOf(ZipLimitError);
    await expect(failure).rejects.toThrow(/"a" inflates past the entry limit/);
  });

  it('leaves a stored entry to the file size, which already bounds it', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES, method: 'store' }],
    });
    await expect(
      open(
        bytes,
        limits({
          maxInflatedEntryBytes: 1,
          maxCompressionRatio: 0,
          ratioExemptBytes: 0,
        }),
      ),
    ).resolves.toBeDefined();
  });

  describe('the compression ratio', () => {
    const zeros = new Uint8Array(10_000);
    const bytes = craftZip({ entries: [{ name: 'z', data: zeros }] });
    const compressed = deflateRawSync(zeros).length;
    const ratio = zeros.length / compressed;

    it('refuses a deflated entry compressed past it', async () => {
      const failure = open(
        bytes,
        limits({ maxCompressionRatio: Math.floor(ratio), ratioExemptBytes: 0 }),
      );
      await expect(failure).rejects.toBeInstanceOf(ZipLimitError);
      await expect(failure).rejects.toThrow(
        /"z" is compressed past the ratio limit/,
      );
    });

    it('allows a deflated entry exactly at it', async () => {
      await expect(
        open(
          bytes,
          limits({ maxCompressionRatio: ratio, ratioExemptBytes: 0 }),
        ),
      ).resolves.toBeDefined();
    });

    it('lets a small entry compress past it, as a text file does', async () => {
      await expect(
        open(
          bytes,
          limits({ maxCompressionRatio: 1, ratioExemptBytes: zeros.length }),
        ),
      ).resolves.toBeDefined();
      await expect(
        open(
          bytes,
          limits({
            maxCompressionRatio: 1,
            ratioExemptBytes: zeros.length - 1,
          }),
        ),
      ).rejects.toThrow(/ratio limit/);
    });
  });

  it('defaults to what an export can hold, and 128 MiB and 100:1 for what inflates', () => {
    expect(ZIP_READ_LIMITS).toEqual({
      maxEntries: 0xffff,
      maxInflatedEntryBytes: 134_217_728,
      maxTotalBytes: 0xffffffff,
      maxCompressionRatio: 100,
      ratioExemptBytes: 1_048_576,
    });
  });

  it('applies the default limits when given none', async () => {
    const bytes = craftZip({
      entries: [
        { name: 'a', data: JSON_BYTES, central: { size: 134_217_729 } },
      ],
    });
    await expect(open(bytes)).rejects.toThrow(/entry limit/);
  });
});
