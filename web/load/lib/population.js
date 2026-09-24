// population.js's setup() and teardown(): many collectors with modest collections, each sharing a category with the next.
import { insertReturning, insertRows, signUp } from './api.js';
import { PROFILE } from './profile.js';
import { NOUNS, clearAccount, fillCategory } from './seed.js';

export const COLLECTORS = PROFILE.population.collectors;
export const ENTRIES_EACH = PROFILE.population.entriesEach;
const SHARED_EACH = Math.ceil(ENTRIES_EACH / 5);

/** One word per collector, so every other collector's word is common across the table and absent from their own. */
const nounOf = (index) => NOUNS[index % NOUNS.length];

export const NOUNS_SEARCHED = [...NOUNS, 'zzqx'];

export function setup() {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const members = [];
  for (let index = 0; index < COLLECTORS; index++) {
    const session = signUp(
      `load-member-${index}-${run}@collectionbuddy.test`,
      crypto.randomUUID(),
    );
    const categories = insertReturning({
      session,
      table: 'categories',
      rows: [{ name: 'Own' }, { name: 'Lent' }],
      select: 'id,name',
    });
    const idOf = (name) =>
      categories.find((category) => category.name === name).id;
    fillCategory({
      session,
      categoryId: idOf('Own'),
      count: ENTRIES_EACH,
      nouns: [nounOf(index)],
    });
    fillCategory({
      session,
      categoryId: idOf('Lent'),
      count: SHARED_EACH,
      nouns: [nounOf(index)],
    });
    members.push({
      session,
      ownCategoryId: idOf('Own'),
      lentCategoryId: idOf('Lent'),
    });
  }
  // A ring: each collector lends one category to the next, so every grantee holds a grant and every table holds many.
  members.forEach((member, index) => {
    const next = members[(index + 1) % members.length];
    insertRows({
      session: member.session,
      table: 'category_shares',
      rows: [
        {
          category_id: member.lentCategoryId,
          invited_email: next.session.email,
        },
      ],
    });
  });
  return { members };
}

export function teardown({ members }) {
  for (const member of members) clearAccount(member.session);
}
