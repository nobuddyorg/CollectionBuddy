import { describe, expect, it } from 'vitest';

import { encodingFor, extensionForType, typeForArchivePath } from './photoType';

describe('encodingFor', () => {
  it('keeps WebP where the canvas encoded it', () => {
    expect(encodingFor('image/webp', 'opaque')).toBe('image/webp');
  });

  // WebKit answers a WebP request with PNG; a null blob reads as no type at all.
  it.each(['image/png', ''])(
    'falls back to JPEG when the probe gave "%s"',
    (probed) => {
      expect(encodingFor(probed, 'opaque')).toBe('image/jpeg');
    },
  );

  it('keeps WebP for a transparent cut-out, whose alpha WebP carries', () => {
    expect(encodingFor('image/webp', 'transparent')).toBe('image/webp');
  });

  // JPEG has no alpha channel: a cut-out's background would come back white.
  it.each(['image/png', ''])(
    'falls back to PNG for a transparent cut-out when the probe gave "%s"',
    (probed) => {
      expect(encodingFor(probed, 'transparent')).toBe('image/png');
    },
  );

  it('still falls back to JPEG for an opaque photo', () => {
    expect(encodingFor('image/png', 'opaque')).toBe('image/jpeg');
  });
});

describe('extensionForType', () => {
  it.each([
    ['image/webp', '.webp'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
  ])('names %s files %s', (type, extension) => {
    expect(extensionForType(type)).toBe(extension);
  });

  it.each(['image/gif', '', 'toString'])(
    'refuses "%s", which the bucket does not accept',
    (type) => {
      expect(() => extensionForType(type)).toThrow(
        `The photo bucket does not accept "${type}"`,
      );
    },
  );
});

describe('typeForArchivePath', () => {
  it.each([
    ['photos/001-a/1.webp', 'image/webp'],
    ['photos/001-a/1.jpg', 'image/jpeg'],
    ['photos/001-a/1.JPEG', 'image/jpeg'],
    ['photos/001-a/1.png', 'image/png'],
  ])('reads %s as %s', (path, type) => {
    expect(typeForArchivePath(path)).toBe(type);
  });

  it.each(['photos/001-a/1.gif', 'photos/001-a.webp/1', 'photos/001-a/1'])(
    'refuses %s',
    (path) => {
      expect(() => typeForArchivePath(path)).toThrow(
        `Not a photograph the bucket accepts: ${path}`,
      );
    },
  );
});
