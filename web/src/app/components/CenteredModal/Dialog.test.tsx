// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('is visible and full scale when open', () => {
    render(
      <Dialog open title="Edit entry" onClose={vi.fn()}>
        content
      </Dialog>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('opacity-100');
    expect(panel.className).toContain('scale-100');
  });

  it('is invisible and scaled down when not open', () => {
    render(
      <Dialog open={false} title="Edit entry" onClose={vi.fn()}>
        content
      </Dialog>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('opacity-0');
    expect(panel.className).toContain('scale-95');
  });

  it('falls back to "Close" for the close button label when none is given', () => {
    render(
      <Dialog open title="Edit entry" onClose={vi.fn()}>
        content
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  });
});
