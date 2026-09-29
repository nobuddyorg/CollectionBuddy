// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { EditItemModal } from './EditItemModal';
import { item } from './item.test-support';

const ITEM = item('item-1', { title: 'Roman coin' });

function renderModal(onOpenChange = vi.fn()) {
  render(
    <I18nProvider>
      <ConfirmProvider>
        <EditItemModal
          open
          item={ITEM}
          isSaving={false}
          onOpenChange={onOpenChange}
          onSubmit={vi.fn()}
        />
      </ConfirmProvider>
    </I18nProvider>,
  );
  return { onOpenChange };
}

// The dialog's X and the form's Cancel share one guard, so Escape and Cancel cover all four paths.
describe('EditItemModal — discarding unsaved changes', () => {
  it('closes immediately on Escape when the form has not been touched', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument();
  });

  it('asks for confirmation on Escape once a field has been edited, and does not close yet', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.type(await screen.findByTestId('item-title'), '!');
    await user.keyboard('{Escape}');

    expect(
      await screen.findByText('Discard your changes?'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes once the discard is confirmed', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.type(await screen.findByTestId('item-title'), '!');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByTestId('confirm-accept'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open with the edit intact when the discard is cancelled', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    const title = await screen.findByTestId('item-title');
    await user.type(title, '!');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByTestId('confirm-cancel'));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(title).toHaveValue('Roman coin!');
  });

  it('routes the explicit Cancel button through the same guard', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.type(await screen.findByTestId('item-title'), '!');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText('Discard your changes?'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
