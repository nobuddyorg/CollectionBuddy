// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SupabaseWarmup } from './SupabaseWarmup';

// #328: this exists purely to put `./supabase` in the layout's own module
// graph so the bundler shares one copy of it across routes instead of
// baking a copy into each route's own chunk -- nothing to assert about
// that from a unit test, but it should render nothing and never throw
// while doing it (importing `./supabase` throws if the required env vars
// are missing, so this also proves the reference actually resolves).
describe('SupabaseWarmup', () => {
  it('renders nothing', () => {
    const { container } = render(<SupabaseWarmup />);
    expect(container).toBeEmptyDOMElement();
  });
});
