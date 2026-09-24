// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SupabaseWarmup } from './SupabaseWarmup';

// Bundling is not unit-testable; rendering without throwing proves the `./supabase` reference resolves.
describe('SupabaseWarmup', () => {
  it('renders nothing', () => {
    const { container } = render(<SupabaseWarmup />);
    expect(container).toBeEmptyDOMElement();
  });
});
