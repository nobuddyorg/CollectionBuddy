// Renders the home-screen, splash-screen, header and favicon icons in
// public/ from the one piece of artwork the app has, public/logo.png.
//
// Usage: node scripts/make-icons.mjs
//
// Run by hand and the results committed, not wired into the build.
//
// Every icon is the artwork scaled *down*, never up -- logo.png is 414px
// across, the ceiling on how sharp any of this can be. Only a vector
// source would lift that.
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

// `themeColor` in layout.tsx / `background_color` in the manifest. Opaque
// on purpose: iOS composites a transparent home-screen icon onto black,
// erasing artwork drawn in dark brown ink.
const PAPER = '#f4f3ef';

// `circle` is for a maskable icon: the launcher may crop to anything inside
// the inner 80% circle, so what has to fit is the artwork's *diagonal*.
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
  // `raw`, not `square`: the header draws the artwork directly (transparent
  // background, no paper tile), so it needs a small crop of the logo, not
  // the full source scaled down by the browser at render time.
  { file: 'logo-header.png', size: 48, fit: 'raw' },
];

const dataUri = `data:image/png;base64,${source.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Returns the PNG buffer directly rather than writing it -- favicon.ico
// below needs a 16px render with no reason to also exist as its own file.
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
// image, then the raw PNG bytes. Built from a fresh 16px render plus the
// 32px favicon already in public/ (framed by hand, read back not
// re-derived).
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
