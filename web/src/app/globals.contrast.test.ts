import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Measured, not eyeballed: low contrast in a dark palette still looks deliberate.
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
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// Mirrors Tailwind's `/NN` opacity compositing, so a pair is measured as what actually reaches the screen.
function withAlpha({
  foreground,
  alpha,
  background,
}: {
  foreground: string;
  alpha: number;
  background: string;
}): string {
  const top = [1, 3, 5].map((i) => parseInt(foreground.slice(i, i + 2), 16));
  const under = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
  const blended = top.map((channel, i) =>
    Math.round(alpha * channel + (1 - alpha) * under[i]),
  );
  return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const themes = {
  light: tokensIn(':root {'),
  dark: tokensIn("[data-theme='dark'] {"),
};

// Every pair is type actually drawn on that surface somewhere in the app.
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

// A control's only visible edge is non-text, so WCAG 1.4.11 holds it to 3:1, not 4.5:1.
const CONTROL_BORDER_PAIRS: [string, string][] = [
  ['control-border', 'card'],
  ['control-border', 'background'],
];

describe.each(Object.entries(themes))('%s theme', (name, tokens) => {
  it('defines every colour the other theme defines', () => {
    // A token missing from one theme keeps its light value: the classic dark-mode hole.
    const other = name === 'light' ? themes.dark : themes.light;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)(
    'carries %s on %s at WCAG AA',
    (foreground, background) => {
      expect(tokens[foreground]).toBeDefined();
      expect(tokens[background]).toBeDefined();
      expect(
        contrast(tokens[foreground], tokens[background]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  // The empty-mount label draws text-foreground/80 on bg-mount; muted-foreground measured 3.85:1 there.
  it('carries foreground/80 on mount at WCAG AA', () => {
    const composite = withAlpha({
      foreground: tokens.foreground,
      alpha: 0.8,
      background: tokens.mount,
    });
    expect(contrast(composite, tokens.mount)).toBeGreaterThanOrEqual(4.5);
  });

  // The empty mount's dashed rule is a non-text boundary, so 1.4.11's 3:1 applies rather than 4.5:1.
  it('carries foreground/60 on mount at WCAG AA non-text contrast', () => {
    const composite = withAlpha({
      foreground: tokens.foreground,
      alpha: 0.6,
      background: tokens.mount,
    });
    expect(contrast(composite, tokens.mount)).toBeGreaterThanOrEqual(3);
  });

  it.each(CONTROL_BORDER_PAIRS)(
    'carries %s on %s at WCAG AA non-text contrast',
    (foreground, background) => {
      expect(tokens[foreground]).toBeDefined();
      expect(tokens[background]).toBeDefined();
      expect(
        contrast(tokens[foreground], tokens[background]),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  // The header's "Buddy" is 16px/18px bold, normal text under WCAG (large starts at 18.66px bold).
  it.each([['background'], ['card']])(
    'carries the accent on %s at normal-text contrast, for the header wordmark',
    (background) => {
      expect(
        contrast(tokens.accent, tokens[background]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([['background'], ['card']])(
    'carries the accent on %s at large-text contrast, for the login wordmark',
    (background) => {
      expect(
        contrast(tokens.accent, tokens[background]),
      ).toBeGreaterThanOrEqual(3);
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

  // Lifted is lighter on a dark page and darker on a light one, so the order reverses between themes.
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
