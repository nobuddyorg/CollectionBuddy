// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton, iconButtonClasses } from './IconButton';

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

  // The outline frame is hover-revealed, which on a touch device means
  // never revealed. It has to be there unconditionally first, and only
  // then be hidden again for pointers -- not the other way round.
  it.each(['outline', 'outlineDestructive'] as const)(
    'keeps %s framed where there is no hover to reveal it',
    (variant) => {
      const classes = iconButtonClasses({ variant });
      expect(classes).toContain('ring-1');
      expect(classes).toContain('ring-border/60');
      expect(classes).toContain('[@media(hover:hover)]:ring-transparent');
    },
  );

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
