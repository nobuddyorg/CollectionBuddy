import { resolve } from 'node:path';

/** Where signed-in.setup.ts leaves the session for the browser to pick up. */
export const AUTH_STATE_PATH = resolve(
  process.cwd(),
  '.e2e-auth/signed-in.json',
);

/**
 * The collection every signed-in test looks at.
 *
 * Small enough to assert on exactly, and shaped around what the tests need to
 * tell apart: two categories, so switching between them is visible; places on
 * some items and not others, because the map only draws the ones that have
 * one; and a search term that matches exactly one entry through a *different*
 * column each time -- title, description, place, tag -- since the search
 * covers all four and a term that only ever matched titles would not notice
 * three of them going missing.
 */
export const SEED = {
  email: 'e2e@collectionbuddy.test',
  password: 'e2e-password-not-a-secret',

  // Two collections to read, and a third for the tests that write.
  //
  // Playwright runs spec files in parallel, and they all share one database
  // and one user -- so a test creating an entry in Münzen while another
  // asserts Münzen contains exactly three would fail, correctly, and at
  // random. Writes are kept off the collections the read tests describe.
  categories: ['Münzen', 'Briefmarken', 'Werkstatt'],
  scratchCategory: 'Werkstatt',

  // Oldest first. The list sorts newest-first, so the last one here is the
  // first card on the page.
  items: [
    {
      category: 'Münzen',
      title: 'Silberdenar',
      description: 'Römische Republik, geprägt in Rom.',
      place: 'Rome',
      place_lat: 41.9028,
      place_lng: 12.4964,
      tags: ['antik', 'silber'],
    },
    {
      category: 'Münzen',
      title: 'Goldgulden',
      description: 'Florentiner Prägung mit Lilie.',
      place: 'Florence',
      place_lat: 43.7696,
      place_lng: 11.2558,
      tags: ['gold'],
    },
    {
      category: 'Münzen',
      // No place: the map must leave this one out while the list keeps it.
      title: 'Notgeld',
      description: 'Papiernotgeld aus der Inflationszeit.',
      place: null,
      place_lat: null,
      place_lng: null,
      tags: ['papier'],
    },
    {
      category: 'Briefmarken',
      title: 'Blaue Mauritius',
      description: 'Zweipenny-Marke mit Randbeschädigung.',
      place: 'Port Louis',
      place_lat: -20.1609,
      place_lng: 57.5012,
      tags: ['selten'],
    },
    {
      // The scratch collection is never empty, so opening it looks the same
      // as opening any other and the tests that write have a baseline to be
      // added to.
      category: 'Werkstatt',
      title: 'Werkstattstück',
      description: 'Bleibt liegen, damit die Werkstatt nie leer ist.',
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    },
  ],
} as const;

/** The seeded items that belong to a category, newest first as the list shows them. */
export function itemsIn(category: string) {
  return SEED.items.filter((item) => item.category === category).toReversed();
}
