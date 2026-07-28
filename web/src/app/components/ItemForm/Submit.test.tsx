// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Submit } from './Submit';

describe('Submit', () => {
  it('submits the surrounding form', () => {
    render(<Submit submitting={false} disabled={false} label="Save" />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  // Regression: this used to render as a bare "+" icon in the create and
  // edit modals, giving no indication of what confirming would do.
  it('always shows its label rather than a bare glyph', () => {
    render(<Submit submitting={false} disabled={false} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveTextContent('Save');
    expect(button).not.toHaveTextContent('+');
  });

  it('keeps the label and marks itself busy while submitting', () => {
    render(<Submit submitting={true} disabled={true} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveTextContent('Save');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows no spinner when idle', () => {
    render(<Submit submitting={false} disabled={false} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('is disabled when asked', () => {
    render(<Submit submitting={false} disabled={true} label="Save" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
