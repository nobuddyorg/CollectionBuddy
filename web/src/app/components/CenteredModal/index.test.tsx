// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CenteredModal from './index';

function appRoot() {
  return document.getElementById('app-root') as HTMLElement;
}

beforeEach(() => {
  const root = document.createElement('div');
  root.id = 'app-root';
  document.body.appendChild(root);
});

afterEach(() => {
  appRoot()?.remove();
});

describe('CenteredModal', () => {
  it('renders nothing while closed', () => {
    render(
      <CenteredModal open={false} onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog when open', () => {
    render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  // aria-modal alone isn't honoured by every reader/browser pairing, and
  // the Tab trap doesn't constrain a screen reader's virtual cursor; the
  // rest of the page has to come out of the accessibility tree.
  it('makes the app root inert while open', () => {
    render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
    );
    expect(appRoot().inert).toBe(true);
  });

  it('restores the app root once the dialog closes', () => {
    const { rerender } = render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
    );
    expect(appRoot().inert).toBe(true);

    rerender(
      <CenteredModal open={false} onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
    );
    expect(appRoot().inert).toBeFalsy();
  });
});
