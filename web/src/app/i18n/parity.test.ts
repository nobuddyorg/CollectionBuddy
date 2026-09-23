import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import de from './de.json';
import en from './en.json';

const SOURCE_ROOT = join(__dirname, '..');

type Tree = string | { [key: string]: Tree };

function flattenKeys(tree: Tree, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (typeof tree === 'string') {
    keys.add(prefix);
    return keys;
  }
  for (const [segment, subtree] of Object.entries(tree)) {
    const nextPrefix = prefix ? `${prefix}.${segment}` : segment;
    for (const key of flattenKeys(subtree, nextPrefix)) keys.add(key);
  }
  return keys;
}

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
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

// Every declared key is dot-separated (`namespace.leaf`), which keeps a plain literal like 'denied' out.
const KEY_LIKE = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

// Walks paren depth to the call's matching `)`, so `t(cond ? 'a' : 'b')` is caught, not only one literal.
function extractCallLiterals(content: string, callOpen: RegExp): string[][] {
  const calls: string[][] = [];
  for (const start of content.matchAll(callOpen)) {
    const literals: string[] = [];
    let depth = 1;
    let i = start.index + start[0].length;
    while (depth > 0 && i < content.length) {
      const character = content[i];
      if (character === '(') depth++;
      else if (character === ')') depth--;
      else if (character === "'" || character === '"') {
        const quote = character;
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
    for (const literals of extractCallLiterals(content, /\bt\(/g)) {
      for (const key of literals) record(key, file);
    }
    // tCount also resolves `${key}_one`, a literal never in source, so it is credited alongside the base key.
    for (const literals of extractCallLiterals(content, /\btCount\(/g)) {
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
  const usedKeys = collectUsedKeys(collectSourceFiles(SOURCE_ROOT));

  it("every t('…') literal in the source exists in en.json", () => {
    const missing = [...usedKeys.keys()].filter((key) => !enKeys.has(key));
    expect(missing).toEqual([]);
  });

  it("every t('…') literal in the source exists in de.json", () => {
    const missing = [...usedKeys.keys()].filter((key) => !deKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('en.json and de.json declare the same set of keys', () => {
    const onlyInEn = [...enKeys].filter((key) => !deKeys.has(key));
    const onlyInDe = [...deKeys].filter((key) => !enKeys.has(key));
    expect({ onlyInEn, onlyInDe }).toEqual({ onlyInEn: [], onlyInDe: [] });
  });

  // The other checks only find keys the source lacks; this one catches a key nothing references any more.
  it('every key in en.json is referenced by some t(…) or tCount(…) literal', () => {
    const unused = [...enKeys].filter((key) => !usedKeys.has(key));
    expect(unused).toEqual([]);
  });
});
