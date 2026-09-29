// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openPanel, renderSelect } from './index.test-support';
import { sharesState } from './shares.test-support';
import { useShares } from './useShares';

// Mocked so the panel's expand-on-open never fires a real Supabase call.
vi.mock('./useShares', () => ({ useShares: vi.fn() }));

// The real hook and export; only the first read is stubbed, refused as PostgREST refuses a signed-out caller.
vi.mock('../../data/exportItemPages', () => ({
  listItemsForExport: vi.fn().mockResolvedValue({
    data: null,
    error: { code: '42501', message: 'permission denied for table items' },
  }),
}));

describe('exporting when the collection cannot be read', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useShares).mockReturnValue(sharesState());
  });

  it('reports the failure and re-enables the button, without hanging as "exporting" forever', async () => {
    renderSelect();
    await openPanel();

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);

    expect(
      await screen.findByText(
        'Could not export this collection. Please try again.',
      ),
    ).toBeVisible();
    expect(exportButton).toBeEnabled();
    expect(exportButton).toHaveAttribute('aria-busy', 'false');
  });
});
