import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The manifest is a static file, not a module, so nothing else in the suite
// would notice it going wrong: a launcher silently takes the best of a bad
// set of icons, and the only symptom is a blurry tile on someone's phone.
const publicDir = new URL('../../public/', import.meta.url);

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

const manifest = JSON.parse(
  readFileSync(new URL('site.webmanifest', publicDir), 'utf8'),
) as {
  scope: string;
  start_url: string;
  icons: ManifestIcon[];
  background_color?: string;
};

// A PNG's IHDR sits at a fixed offset, so the real dimensions of an icon can
// be had without decoding it or taking a dependency to do so.
function pngSize(file: string): { width: number; height: number } {
  const png = readFileSync(new URL(file, publicDir));
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const localName = (src: string) => src.replace(manifest.scope, '');
const edge = (icon: ManifestIcon) => Number(icon.sizes.split('x')[0]);

describe('site.webmanifest', () => {
  it('serves every icon from the deployed scope', () => {
    // The file is static, so paths are literal and must stay in step with
    // the scope by hand rather than interpolated like layout.tsx does.
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith(manifest.scope)).toBe(true);
    }
    expect(manifest.start_url).toBe(manifest.scope);
  });

  it('points every icon at a file that is actually there', () => {
    for (const icon of manifest.icons) {
      expect(() => pngSize(localName(icon.src))).not.toThrow();
    }
  });

  it('declares each icon at the size it really is', () => {
    for (const icon of manifest.icons) {
      const { width, height } = pngSize(localName(icon.src));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });

  // 180px used to be the largest on offer, stretched threefold for a 512px
  // splash screen.
  it('offers an icon large enough for a splash screen to use as-is', () => {
    const usable = manifest.icons.filter(
      (icon) => icon.purpose !== 'maskable' && edge(icon) >= 512,
    );
    expect(usable.length).toBeGreaterThan(0);
  });

  it('offers a maskable icon so a launcher crops the padding, not the artwork', () => {
    const maskable = manifest.icons.filter(
      (icon) => icon.purpose === 'maskable',
    );
    expect(maskable.length).toBeGreaterThan(0);
    for (const icon of maskable) expect(edge(icon)).toBeGreaterThanOrEqual(512);
  });

  // Without one the splash screen is drawn on white, which is not the paper
  // the icon and the app are on.
  it('names the background the splash screen is drawn on', () => {
    expect(manifest.background_color).toBe('#f4f3ef');
  });
});
