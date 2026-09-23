import { test as base } from './coverage';

import { createPageTree } from './pages';

/** A function of `page`, not a tree, so a spec with a second browser context can point it there. */
export const test = base.extend<{ on: typeof createPageTree }>({
  // Named provide, not use: inside a property called on, `use` reads to react-hooks/rules-of-hooks as a hook.
  on: async ({}, provide) => {
    await provide((page) => createPageTree(page));
  },
});

export { expect } from '@playwright/test';
