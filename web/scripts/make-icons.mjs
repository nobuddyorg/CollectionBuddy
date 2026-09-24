// Renders public/'s icons from public/logo.png (414px wide, so every icon scales down, never up); run by hand, results committed.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const publicDirectory = new URL('../public/', import.meta.url);
const sourceFile = new URL('logo.png', publicDirectory);
const source = readFileSync(sourceFile);

// A PNG's IHDR is fixed-position, so the proportions come from the file rather than a restated constant.
const sourceWidth = source.readUInt32BE(16);
const sourceHeight = source.readUInt32BE(20);
const aspect = sourceWidth / sourceHeight;

// `themeColor` in layout.tsx / manifest `background_color`; opaque because iOS composites a transparent icon onto black.
const PAPER = '#f4f3ef';

// A maskable icon may be cropped to the inner 80% circle, so the artwork's diagonal is what has to fit.
const SQUARE_SPAN = 0.78;
const SAFE_CIRCLE = 0.8;

const artworkWidth = (size, fit) =>
  fit === 'circle'
    ? (size * SAFE_CIRCLE * aspect) / Math.hypot(aspect, 1)
    : size * SQUARE_SPAN;

const targets = [
  // The two sizes Android looks for: home screen, then splash screen and install prompt.
  { file: 'icon-192.png', size: 192, fit: 'square' },
  { file: 'icon-512.png', size: 512, fit: 'square' },
  { file: 'icon-maskable-512.png', size: 512, fit: 'circle' },
  // iOS asks for exactly 180 and scales it itself.
  { file: 'apple-touch-icon.png', size: 180, fit: 'square' },
  // The header draws the artwork on a transparent background, so it needs a small crop, not a paper tile.
  { file: 'logo-header.png', size: 48, fit: 'raw' },
];

const dataUri = `data:image/png;base64,${source.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

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

// Returns the buffer: favicon.ico's 16px layer needs a square render that never becomes its own file.
async function renderSquare({ size, fit, background }) {
  const width = artworkWidth(size, fit);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:${background};display:flex;align-items:center;justify-content:center">
       <img src="${dataUri}" style="width:${width}px;height:auto;display:block">
     </body>`,
  );
  await page.locator('img').waitFor({ state: 'visible' });
  return page.screenshot({
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: background === 'transparent',
  });
}

for (const { file, size, fit } of targets) {
  if (fit === 'raw') {
    const width = Math.min(size, sourceWidth);
    const png = await renderRaw(width);
    writeFileSync(new URL(file, publicDirectory), png);
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

  const png = await renderSquare({ size, fit, background: PAPER });
  writeFileSync(new URL(file, publicDirectory), png);
  console.log(
    `${file}: ${size}x${size}, artwork ${Math.round(width)}px wide (${(width / sourceWidth).toFixed(2)}x source)`,
  );
}

// An ICONDIR header, one ICONDIRENTRY per image, then the raw PNG bytes.
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

// Transparent, unlike the app icons: the hand-framed favicon-32x32.png already is, and a browser tab supplies its own background.
const favicon16 = await renderSquare({
  size: 16,
  fit: 'square',
  background: 'transparent',
});
const favicon32 = readFileSync(new URL('favicon-32x32.png', publicDirectory));
const ico = buildIco([
  { width: 16, height: 16, png: favicon16 },
  {
    width: favicon32.readUInt32BE(16),
    height: favicon32.readUInt32BE(20),
    png: favicon32,
  },
]);
writeFileSync(new URL('favicon.ico', publicDirectory), ico);
console.log(`favicon.ico: 16px + 32px, ${ico.length} bytes`);

await browser.close();
