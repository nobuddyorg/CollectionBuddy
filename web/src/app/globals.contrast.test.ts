import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The redesign that produced this palette was set off by measured failures
// -- tag text at 2.1:1 and 4.0:1 against its card -- so the ratios are held
// here rather than left to the eye. A second theme doubles the surface for
// that kind of mistake: dark palettes fail quietly, because low contrast on
// a dark page still looks deliberate.
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

describe.each(Object.entries(themes))('%s theme', (name, tokens) => {
  it('defines every colour the other theme defines', () => {
    // A token present in one theme and missing from the other is the classic
    // dark-mode hole: the light value stays put and one element on the page
    // keeps its paper colour.
    const other = name === 'light' ? themes.dark : themes.light;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)('carries %s on %s at WCAG AA', (fg, bg) => {
    expect(tokens[fg]).toBeDefined();
    expect(tokens[bg]).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // The accent is the wordmark, and it is drawn at two sizes. The header's
  // "Buddy" is 16px/18px at font-display weight 700 -- normal text under
  // WCAG (large text starts at 18.66px bold or 24px regular), so it needs
  // the same 4.5:1 as any other text. Only the login page's 4xl/5xl mark is
  // genuinely large, and gets the 3:1 large-text allowance.
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
    // And genuinely dark, not merely dimmer than the light theme.
    expect(relativeLuminance(themes.dark.background)).toBeLessThan(0.05);
  });

  // A card is a mount lifted off the page; an empty mount is a hollow cut
  // into that card. The order has to hold in both themes, which means it
  // reverses -- lifted is lighter on a dark page and darker on a light one.
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
