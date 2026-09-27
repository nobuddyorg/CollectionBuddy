// Usage: node generate.mjs <web/node_modules/sharp> [own photos dir, ideally >= 1000 px]; writes WebP, PNG (Safari) and JPEG derivatives.
import { readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(import.meta.url)(resolve(process.argv[2]));
const here = fileURLToPath(new URL('.', import.meta.url));
const extra = process.argv[3];
const isPhoto = (name) => /\.(png|jpe?g|webp)$/i.test(name);
const sources = [
  ...readdirSync(join(here, 'source'))
    .filter(isPhoto)
    .map((name) => join(here, 'source', name)),
  ...(extra
    ? readdirSync(extra)
        .filter(isPhoto)
        .map((name) => join(extra, name))
    : []),
];

// browser-image-compression never upscales; adaptive filtering is what browsers' PNG encoders do by default.
const ENCODE = {
  webp: (image) => image.webp({ quality: 80 }),
  png: (image) => image.png({ adaptiveFiltering: true }),
  jpeg: (image) => image.jpeg({ quality: 80 }),
};

const manifest = [];
for (const source of sources) {
  const name = source
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
  for (const [format, encode] of Object.entries(ENCODE)) {
    // useItemImages.tsx: the full size at 1000 px, then the thumbnail from that full-size output at 600 px.
    const full = await encode(
      sharp(source).resize(1000, 1000, {
        fit: 'inside',
        withoutEnlargement: true,
      }),
    ).toBuffer({ resolveWithObject: true });
    const thumb = await encode(
      sharp(full.data).resize(600, 600, {
        fit: 'inside',
        withoutEnlargement: true,
      }),
    ).toBuffer({ resolveWithObject: true });
    for (const [kind, { data, info }] of [
      ['full', full],
      ['thumb', thumb],
    ]) {
      const file = `${name}.${kind}.${format}`;
      writeFileSync(join(here, file), data);
      manifest.push({
        photo: name,
        kind,
        format,
        file,
        width: info.width,
        height: info.height,
        bytes: data.length,
      });
    }
  }
}
writeFileSync(join(here, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.table(manifest);

// A phone-camera-sized input (12 MP JPEG, q0.9) for worker-csp.js: an upscale, so its bytes understate a real photo; its pixel count, which drives compression CPU, does not.
const camera = await sharp(join(here, 'source', 'coffee.png'))
  .resize(4032, 3024, { fit: 'fill', kernel: 'lanczos3' })
  .jpeg({ quality: 90 })
  .toBuffer();
writeFileSync(join(here, 'camera-12mp.jpeg'), camera);
console.log('camera-12mp.jpeg', camera.length);

// import-memory.js: ~1 MB of high-entropy JPEG at 1024x768, so the archive is bulky while each thumbnail decode stays ~3 MB.
const archivePhoto = await sharp({
  create: {
    width: 1024,
    height: 768,
    channels: 3,
    background: { r: 128, g: 128, b: 128 },
    noise: { type: 'gaussian', mean: 128, sigma: 60 },
  },
})
  .jpeg({ quality: 100 })
  .toBuffer();
writeFileSync(join(here, 'archive-photo.jpeg'), archivePhoto);
console.log('archive-photo.jpeg', archivePhoto.length);
