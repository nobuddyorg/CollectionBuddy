// Renders the home-screen and splash-screen icons in public/ from the one
// piece of artwork the app has, public/logo.png.
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
];

const dataUri = `data:image/png;base64,${source.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const { file, size, fit } of targets) {
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

await browser.close();
