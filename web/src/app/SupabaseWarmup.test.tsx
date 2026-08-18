// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SupabaseWarmup } from './SupabaseWarmup';

// There's nothing to assert about bundling from a unit test; rendering
// without throwing at least proves the `./supabase` reference resolves
// (it throws if the required env vars are missing).
describe('SupabaseWarmup', () => {
  it('renders nothing', () => {
    const { container } = render(<SupabaseWarmup />);
    expect(container).toBeEmptyDOMElement();
  });
});
