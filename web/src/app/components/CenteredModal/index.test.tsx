// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { appRoot, mountAppRoot, removeAppRoot } from './appRoot.test-support';
import CenteredModal from './index';

beforeEach(mountAppRoot);

afterEach(removeAppRoot);

describe('CenteredModal', () => {
  it('renders nothing while closed', () => {
    render(
      <CenteredModal open={false} onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
      { wrapper: I18nProvider },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog when open', () => {
    render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
      { wrapper: I18nProvider },
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  // Neither aria-modal nor the Tab trap constrains a screen reader's virtual cursor; inert does.
  it('makes the app root inert while open', () => {
    render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
      { wrapper: I18nProvider },
    );
    expect(appRoot().inert).toBe(true);
  });

  it('closes on a backdrop click', async () => {
    const onOpenChange = vi.fn();
    render(
      <CenteredModal open onOpenChange={onOpenChange} title="Edit entry">
        content
      </CenteredModal>,
      { wrapper: I18nProvider },
    );
    const backdrop = document.querySelector('.z-backdrop') as HTMLElement;

    await userEvent.click(backdrop);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('restores the app root once the dialog closes', () => {
    const { rerender } = render(
      <CenteredModal open onOpenChange={vi.fn()} title="Edit entry">
        content
      </CenteredModal>,
      { wrapper: I18nProvider },
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
