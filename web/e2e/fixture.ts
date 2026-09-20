import { test as base } from './coverage';

import { createPageTree } from './pages';

/**
 * Adds `on`, the one handle every spec reaches the interface through:
 * `on(page).catalogue.do.search('...')` for an interaction,
 * `on(page).catalogue.locators.cards` for the element behind it.
 *
 * A function of `page` rather than a ready-made tree, so a spec that opens
 * a second browser context can point it at that context's page too.
 */
export const test = base.extend<{ on: typeof createPageTree }>({
  // `provide`, not Playwright's usual `use`: named `use` inside a property
  // called `on`, it reads to react-hooks/rules-of-hooks as a hook call.
  on: async ({}, provide) => {
    await provide((page) => createPageTree(page));
  },
});

export { expect } from '@playwright/test';
