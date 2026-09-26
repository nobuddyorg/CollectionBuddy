// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('closes through its close button, named by the label it is given', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit entry" closeLabel="Schließen" onClose={onClose}>
        content
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
