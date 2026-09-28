// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Submit } from './Submit';

describe('Submit', () => {
  it('submits the surrounding form', () => {
    render(<Submit submitting={false} label="Save" />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('always shows its label rather than a bare glyph', () => {
    render(<Submit submitting={false} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveTextContent('Save');
    expect(button).not.toHaveTextContent('+');
  });

  it('keeps the label and marks itself busy while submitting', () => {
    render(<Submit submitting={true} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveTextContent('Save');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows no spinner when idle', () => {
    render(<Submit submitting={false} label="Save" />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button).not.toBeDisabled();
  });

  it('is disabled while submitting', () => {
    render(<Submit submitting={true} label="Save" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
