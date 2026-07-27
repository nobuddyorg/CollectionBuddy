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

// Matches t('some.key') / t("some.key") call literals. Dynamic keys
// (t(someVariable)) aren't statically checkable and are skipped, same as
// any usage that isn't a plain string literal.
const T_CALL_PATTERN = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

function collectUsedKeys(files: string[]): Map<string, string[]> {
  const usages = new Map<string, string[]>();
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(T_CALL_PATTERN)) {
      const key = match[1];
      const existing = usages.get(key) ?? [];
      existing.push(file);
      usages.set(key, existing);
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
});
