import { describe, expect, it } from 'vitest';

import { idAfter } from './idAfter';

describe('idAfter', () => {
  it('is the next UUID, one more in its last digit', () => {
    expect(idAfter('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
    );
  });

  it('carries into the groups before, as a number would', () => {
    expect(idAfter('3f2504e0-4f89-41d3-9a0c-ffffffffffff')).toBe(
      '3f2504e0-4f89-41d3-9a0d-000000000000',
    );
    expect(idAfter('3f2504e0-ffff-ffff-ffff-ffffffffffff')).toBe(
      '3f2504e1-0000-0000-0000-000000000000',
    );
  });

  it('keeps the leading zeros a UUID is written with', () => {
    expect(idAfter('00000000-0000-0000-0000-000000000009')).toBe(
      '00000000-0000-0000-0000-00000000000a',
    );
  });

  // Postgres compares uuid values byte by byte, so text order on lower-case hex is its order.
  it('sorts after the id it follows and before any larger one', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const larger = '7c9e6679-7425-40de-944b-e07fc1f90ae9';

    expect(idAfter(id) > id).toBe(true);
    expect(idAfter(id) < larger).toBe(true);
  });
});
