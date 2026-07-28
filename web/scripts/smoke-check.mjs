// Loads a real page in a headless browser and fails if it throws at runtime
// or never renders. Catches bugs a successful `next build` can't see -- e.g.
// client code that only works because the *build* process (real Node,
// real env vars) papers over something the *browser* bundle can't do.
//
// Usage: node scripts/smoke-check.mjs <url>
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/smoke-check.mjs <url>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));

let title = '';
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  title = await page.title();
} catch (err) {
  console.error(`Failed to load ${url}: ${err.message}`);
  await browser.close();
  process.exit(1);
}

await browser.close();

if (pageErrors.length > 0) {
  console.error(`${url} threw ${pageErrors.length} runtime error(s):`);
  for (const msg of pageErrors) console.error(`  - ${msg}`);
  process.exit(1);
}

if (!title.includes('CollectionBuddy')) {
  console.error(
    `${url} loaded but title was "${title}", expected it to contain "CollectionBuddy"`,
  );
  process.exit(1);
}

console.log(`OK: ${url} rendered with no runtime errors (title: "${title}")`);
