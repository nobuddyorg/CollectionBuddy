// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('closes through its translated close button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit entry" onClose={onClose}>
        content
      </Dialog>,
      { wrapper: I18nProvider },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
