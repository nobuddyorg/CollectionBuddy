// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('defaults to type="button" so it never submits an ambient form', () => {
    render(<IconButton>x</IconButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('applies the requested variant and size classes', () => {
    render(
      <IconButton variant="destructive" size="lg">
        x
      </IconButton>,
    );
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-destructive');
    expect(button.className).toContain('w-10 h-10');
  });

  it('merges a caller-supplied className instead of replacing the defaults', () => {
    render(<IconButton className="custom-class">x</IconButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
    expect(button.className).toContain('bg-primary');
  });

  it('forwards click handling and other button props', async () => {
    const onClick = vi.fn();
    render(
      <IconButton onClick={onClick} aria-label="save">
        x
      </IconButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
