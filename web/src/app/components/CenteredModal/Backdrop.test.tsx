// @vitest-environment jsdom
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Backdrop } from './Backdrop';

describe('Backdrop', () => {
  it('is visible and clickable when open', async () => {
    const onClick = vi.fn();
    const { container } = render(<Backdrop open onClick={onClick} />);
    const backdrop = container.firstElementChild as HTMLElement;

    expect(backdrop.className).toContain('opacity-100');
    expect(backdrop.className).not.toContain('pointer-events-none');

    await userEvent.click(backdrop);
    expect(onClick).toHaveBeenCalled();
  });

  it('is invisible and inert when not open', () => {
    const { container } = render(<Backdrop open={false} />);
    const backdrop = container.firstElementChild as HTMLElement;

    expect(backdrop.className).toContain('opacity-0');
    expect(backdrop.className).toContain('pointer-events-none');
  });
});
