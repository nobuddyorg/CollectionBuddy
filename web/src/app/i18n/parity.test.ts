import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import de from './de.json';
import en from './en.json';

const SRC_ROOT = join(__dirname, '..');

type Tree = string | { [key: string]: Tree };

function flattenKeys(tree: Tree, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (typeof tree === 'string') {
    keys.add(prefix);
    return keys;
  }
  for (const [k, v] of Object.entries(tree)) {
    const nextPrefix = prefix ? `${prefix}.${k}` : k;
    for (const key of flattenKeys(v, nextPrefix)) keys.add(key);
  }
  return keys;
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (
      /\.tsx?$/.test(entry) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      files.push(full);
    }
  }
  return files;
}

// Every declared key is dot-separated (`namespace.leaf`), so this is what
// keeps a non-key literal like `result.reason === 'denied'` from being
// mistaken for a translation key.
const KEY_LIKE = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

// Walks paren depth from a call's `(` to its matching `)`, collecting every
// key-shaped literal in between -- so `t(cond ? 'a' : 'b')` is caught, not
// just the plain single-literal case.
function extractCallLiterals(content: string, name: string): string[][] {
  const calls: string[][] = [];
  const callOpen = new RegExp(`\\b${name}\\(`, 'g');
  for (const start of content.matchAll(callOpen)) {
    const literals: string[] = [];
    let depth = 1;
    let i = start.index + start[0].length;
    while (depth > 0 && i < content.length) {
      const ch = content[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === "'" || ch === '"') {
        const quote = ch;
        const end = content.indexOf(quote, i + 1);
        if (end === -1) break;
        const literal = content.slice(i + 1, end);
        if (KEY_LIKE.test(literal)) literals.push(literal);
        i = end;
      }
      i++;
    }
    calls.push(literals);
  }
  return calls;
}

function collectUsedKeys(files: string[]): Map<string, string[]> {
  const usages = new Map<string, string[]>();
  const record = (key: string, file: string) => {
    const existing = usages.get(key) ?? [];
    existing.push(file);
    usages.set(key, existing);
  };
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const literals of extractCallLiterals(content, 't')) {
      for (const key of literals) record(key, file);
    }
    // tCount also resolves to `${key}_one` for a count of one (see
    // I18nProvider's tCount), but that literal never appears in source, so
    // it's credited as used alongside the base key.
    for (const literals of extractCallLiterals(content, 'tCount')) {
      for (const key of literals) {
        record(key, file);
        record(`${key}_one`, file);
      }
    }
  }
  return usages;
}

describe('i18n key parity', () => {
  const enKeys = flattenKeys(en);
  const deKeys = flattenKeys(de);
  const usedKeys = collectUsedKeys(collectSourceFiles(SRC_ROOT));

  it("every t('…') literal in the source exists in en.json", () => {
    const missing = [...usedKeys.keys()].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("every t('…') literal in the source exists in de.json", () => {
    const missing = [...usedKeys.keys()].filter((k) => !deKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('en.json and de.json declare the same set of keys', () => {
    const onlyInEn = [...enKeys].filter((k) => !deKeys.has(k));
    const onlyInDe = [...deKeys].filter((k) => !enKeys.has(k));
    expect({ onlyInEn, onlyInDe }).toEqual({ onlyInEn: [], onlyInDe: [] });
  });

  // The other three checks only look for keys the source is missing; this
  // one catches a key nothing references any more.
  it('every key in en.json is referenced by some t(…) or tCount(…) literal', () => {
    const unused = [...enKeys].filter((k) => !usedKeys.has(k));
    expect(unused).toEqual([]);
  });
});
