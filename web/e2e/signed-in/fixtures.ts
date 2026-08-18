import { resolve } from 'node:path';

/** Where signed-in.setup.ts leaves the session for the browser to pick up. */
export const AUTH_STATE_PATH = resolve(
  process.cwd(),
  '.e2e-auth/signed-in.json',
);

/** Ids and access tokens of both users, for tests that check cross-user RLS directly. */
export const CONTEXT_PATH = resolve(process.cwd(), '.e2e-auth/context.json');

export type SeedContext = {
  userId: string;
  token: string;
  otherUserId: string;
  otherToken: string;
};

/**
 * The collection every signed-in test looks at.
 *
 * Small enough to assert on exactly. Search terms are chosen so each matches
 * exactly one entry through a different column (title, description, place,
 * tag), so the search test notices a broken column rather than just one match.
 */
export const SEED = {
  email: 'e2e@collectionbuddy.test',
  password: 'e2e-password-not-a-secret',

  /**
   * A second collector, with a collection of their own.
   *
   * Row-level security is this app's whole authorization boundary (no server
   * exists to check anything else). A single-user suite can't notice a broken
   * policy, since every query it makes is one policies are supposed to allow
   * anyway; another user's rows have to exist before "cannot see them" means
   * anything.
   */
  other: {
    email: 'e2e-other@collectionbuddy.test',
    password: 'other-password-not-a-secret',
    category: 'Fremde Sammlung',
    item: 'Fremdes Fundstück',
  },

  // One scratch collection per writing spec, kept separate from the read
  // collections and from each other: specs run in parallel against one
  // database, so a test creating an entry while another counts them fails at
  // random if they share a collection.
  categories: [
    'Münzen',
    'Briefmarken',
    'Werkstatt',
    'Fotostudio',
    'Exportarchiv',
  ],
  /** For entries.spec.ts. */
  scratchCategory: 'Werkstatt',
  /** For photos.spec.ts, which also creates and deletes entries. */
  photoCategory: 'Fotostudio',
  /** For export.spec.ts, which also creates, photographs and deletes an entry. */
  exportCategory: 'Exportarchiv',

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
      // No place: the map should leave this one out while the list keeps it.
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
      // Keeps the scratch collection non-empty so writing tests have a baseline.
      category: 'Werkstatt',
      title: 'Werkstattstück',
      description: 'Bleibt liegen, damit die Werkstatt nie leer bleibt.',
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    },
    {
      category: 'Fotostudio',
      title: 'Studiostück',
      description: 'Bleibt liegen, damit das Studio nie leer bleibt.',
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    },
    {
      category: 'Exportarchiv',
      title: 'Archivstück',
      description: 'Bleibt liegen, damit das Archiv nie leer bleibt.',
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
