import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Measured contrast failures motivated this suite; dark palettes fail
// quietly since low contrast there still looks deliberate.
const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');

function tokensIn(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  return Object.fromEntries(
    Array.from(body.matchAll(/--([\w-]+):\s*([^;]+);/g)).map(
      ([, name, value]) => [name, value.trim()],
    ),
  );
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// Tailwind's `/NN` opacity modifier composites the colour onto whatever's
// behind it before paint, so e.g. `text-foreground/80` on `bg-mount` is
// neither `fg` nor `mount` but the two blended. This mirrors that
// compositing so the pair is measured as what actually reaches the screen.
function withAlpha(hexFg: string, alpha: number, hexBg: string): string {
  const fg = [1, 3, 5].map((i) => parseInt(hexFg.slice(i, i + 2), 16));
  const bg = [1, 3, 5].map((i) => parseInt(hexBg.slice(i, i + 2), 16));
  const blended = fg.map((f, i) => Math.round(alpha * f + (1 - alpha) * bg[i]));
  return `#${blended.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const themes = {
  light: tokensIn(':root {'),
  dark: tokensIn("[data-theme='dark'] {"),
};

// Every pair here is type actually drawn on that surface somewhere in the
// app, not a combination that merely could occur.
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['foreground', 'mount'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'card'],
];

// --control-border is the only visible edge of every text input, textarea,
// search field and outline button -- a non-text element, so WCAG 1.4.11
// holds it to 3:1, not the 4.5:1 that TEXT_PAIRS checks.
const CONTROL_BORDER_PAIRS: [string, string][] = [
  ['control-border', 'card'],
  ['control-border', 'background'],
];

describe.each(Object.entries(themes))('%s theme', (name, tokens) => {
  it('defines every colour the other theme defines', () => {
    // A token missing from one theme is the classic dark-mode hole: the
    // light value stays put and one element keeps its paper colour.
    const other = name === 'light' ? themes.dark : themes.light;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)('carries %s on %s at WCAG AA', (fg, bg) => {
    expect(tokens[fg]).toBeDefined();
    expect(tokens[bg]).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // The empty-mount "no images" label draws `text-foreground/80` on
  // `bg-mount` (AddPhotoPlate, ItemList/Actions.tsx) rather than
  // `muted-foreground`, which measured 3.85:1 here -- below AA.
  it('carries foreground/80 on mount at WCAG AA', () => {
    const composite = withAlpha(tokens.foreground, 0.8, tokens.mount);
    expect(contrast(composite, tokens.mount)).toBeGreaterThanOrEqual(4.5);
  });

  // The empty mount's dashed rule (AddPhotoPlate, ItemList/Actions.tsx) is a
  // non-text boundary, held to 1.4.11's 3:1 rather than the 4.5:1 text
  // pairs above. It used to draw at 20%, measuring as low as 1.47:1 -- an
  // edge nobody could actually see.
  it('carries foreground/60 on mount at WCAG AA non-text contrast', () => {
    const composite = withAlpha(tokens.foreground, 0.6, tokens.mount);
    expect(contrast(composite, tokens.mount)).toBeGreaterThanOrEqual(3);
  });

  it.each(CONTROL_BORDER_PAIRS)(
    'carries %s on %s at WCAG AA non-text contrast',
    (fg, bg) => {
      expect(tokens[fg]).toBeDefined();
      expect(tokens[bg]).toBeDefined();
      expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
    },
  );

  // The accent is the wordmark, drawn at two sizes. The header's "Buddy" is
  // 16px/18px bold -- normal text under WCAG (large text starts at 18.66px
  // bold), so it needs 4.5:1. Only the login page's 4xl/5xl mark is
  // genuinely large, getting the 3:1 allowance.
  it.each([['background'], ['card']])(
    'carries the accent on %s at normal-text contrast, for the header wordmark',
    (bg) => {
      expect(contrast(tokens.accent, tokens[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([['background'], ['card']])(
    'carries the accent on %s at large-text contrast, for the login wordmark',
    (bg) => {
      expect(contrast(tokens.accent, tokens[bg])).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('the dark theme', () => {
  it('is dark -- its page is darker than its type', () => {
    expect(relativeLuminance(themes.dark.background)).toBeLessThan(
      relativeLuminance(themes.dark.foreground),
    );
    // Genuinely dark, not merely dimmer than the light theme.
    expect(relativeLuminance(themes.dark.background)).toBeLessThan(0.05);
  });

  // A card is lifted off the page; an empty mount is cut into that card.
  // The order holds in both themes, so it reverses -- lifted is lighter on
  // a dark page and darker on a light one.
  it('lifts a card off the page and sinks the empty mount into the card', () => {
    const page = relativeLuminance(themes.dark.background);
    const card = relativeLuminance(themes.dark.card);
    const mount = relativeLuminance(themes.dark.mount);
    expect(card).toBeGreaterThan(page);
    expect(mount).toBeLessThan(card);
  });

  it('sinks the empty mount below the card in the light theme too', () => {
    expect(relativeLuminance(themes.light.mount)).toBeLessThan(
      relativeLuminance(themes.light.card),
    );
  });
});
