// Renders the home-screen, splash-screen, header and favicon icons in
// public/ from the one piece of artwork the app has, public/logo.png.
//
// Usage: node scripts/make-icons.mjs
//
// Run by hand and the results committed, not wired into the build: it needs a
// browser download, and the artwork changes about once a project.
//
// Every icon it writes is the artwork scaled *down*, never up. logo.png is
// 414px across, so that is the ceiling on how sharp any of this can be -- the
// blur being fixed here came from a launcher taking the 180px apple-touch
// icon, the largest the manifest offered, and stretching it to fill a 512px
// splash screen (#266). A vector source would lift the ceiling; nothing else
// will.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const publicDir = new URL('../public/', import.meta.url);
const sourceFile = new URL('logo.png', publicDir);
const source = readFileSync(sourceFile);

// A PNG's IHDR is fixed-position, so the artwork's proportions come out of
// the file itself rather than being restated here and drifting from it.
const sourceWidth = source.readUInt32BE(16);
const sourceHeight = source.readUInt32BE(20);
const aspect = sourceWidth / sourceHeight;

// The paper the rest of the app is printed on -- `themeColor` in layout.tsx
// and `background_color` in the manifest. Opaque on purpose, twice over: iOS
// composites a transparent home-screen icon onto black, which all but erases
// artwork drawn in dark brown ink, and an opaque icon matching the splash
// screen's own background makes the two read as one surface rather than a
// tile sitting on it.
const PAPER = '#f4f3ef';

// How much of the tile the artwork spans. `square` is the plain icon, framed
// with a margin the way an exhibit is. `circle` is for a maskable icon: the
// launcher may crop the tile to anything inside its inner 80% circle, so what
// has to fit that circle is the artwork's *diagonal*, which is a good deal
// less generous than it sounds.
const SQUARE_SPAN = 0.78;
const SAFE_CIRCLE = 0.8;

const artworkWidth = (size, fit) =>
  fit === 'circle'
    ? (size * SAFE_CIRCLE * aspect) / Math.hypot(aspect, 1)
    : size * SQUARE_SPAN;

const targets = [
  // 192 and 512 are the two sizes Android looks for: the home screen takes
  // the first, the splash screen and the install prompt the second.
  { file: 'icon-192.png', size: 192, fit: 'square' },
  { file: 'icon-512.png', size: 512, fit: 'square' },
  { file: 'icon-maskable-512.png', size: 512, fit: 'circle' },
  // iOS asks for exactly 180 and scales it itself; there is no larger size
  // to give it.
  { file: 'apple-touch-icon.png', size: 180, fit: 'square' },
  // The header's own copy of the mark, rendered at roughly 2x a 24px slot
  // so it's sharp on a standard display. `raw`, not `square`: the header
  // draws the artwork directly (transparent background, its own aspect,
  // no paper tile), so what it needs is a small crop of the same PNG the
  // full-size logo already is -- not the 212 KB source scaled down by the
  // browser at render time (#288).
  { file: 'logo-header.png', size: 48, fit: 'raw' },
];

const dataUri = `data:image/png;base64,${source.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// `raw` takes `size` as a target width (this artwork is wider than it is
// tall) and returns the PNG buffer directly, rather than writing it --
// favicon.ico below needs one at 16px that has no reason to also exist as
// its own committed file.
async function renderRaw(width) {
  const height = Math.round(width / aspect);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<body style="margin:0;width:${width}px;height:${height}px;background:transparent">
       <img src="${dataUri}" style="width:${width}px;height:${height}px;display:block">
     </body>`,
  );
  await page.locator('img').waitFor({ state: 'visible' });
  return page.screenshot({
    clip: { x: 0, y: 0, width, height },
    omitBackground: true,
  });
}

for (const { file, size, fit } of targets) {
  if (fit === 'raw') {
    const width = Math.min(size, sourceWidth);
    const png = await renderRaw(width);
    writeFileSync(new URL(file, publicDir), png);
    console.log(
      `${file}: ${width}px wide, raw (${(width / sourceWidth).toFixed(2)}x source)`,
    );
    continue;
  }

  const width = artworkWidth(size, fit);
  if (width > sourceWidth) {
    console.error(
      `Refusing to write ${file}: it would scale the artwork up to ${Math.round(width)}px from ${sourceWidth}px.`,
    );
    await browser.close();
    process.exit(1);
  }

  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:${PAPER};display:flex;align-items:center;justify-content:center">
       <img src="${dataUri}" style="width:${width}px;height:auto;display:block">
     </body>`,
  );
  await page.locator('img').waitFor({ state: 'visible' });

  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: size, height: size },
  });
  writeFileSync(new URL(file, publicDir), png);
  console.log(
    `${file}: ${size}x${size}, artwork ${Math.round(width)}px wide (${(width / sourceWidth).toFixed(2)}x source)`,
  );
}

// favicon.ico: a plain ICONDIR header followed by one ICONDIRENTRY per
// image, then the images themselves, raw PNG bytes and all -- valid since
// Vista, and what every browser and OS in current use expects. Built from a
// fresh 16px render plus the 32px favicon already in public/ (itself framed
// by hand, not by this script, so it's read back rather than re-derived).
// The file this replaces was a single 256x256 32-bit bitmap at 217 KB; nothing
// on a browser tab or bookmarks bar draws an icon anywhere near that size.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = [];
  for (const { width, height, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color count: not palette-based
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const favicon16 = await renderRaw(16);
const favicon32 = readFileSync(new URL('favicon-32x32.png', publicDir));
const ico = buildIco([
  { width: 16, height: 16, png: favicon16 },
  {
    width: favicon32.readUInt32BE(16),
    height: favicon32.readUInt32BE(20),
    png: favicon32,
  },
]);
writeFileSync(new URL('favicon.ico', publicDir), ico);
console.log(`favicon.ico: 16px + 32px, ${ico.length} bytes`);

await browser.close();
