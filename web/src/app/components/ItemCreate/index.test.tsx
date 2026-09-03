// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { createItem, linkItemToCategory } from '../../data/items';
import ItemCreate from './index';

vi.mock('../../data/items', () => ({
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  linkItemToCategory: vi.fn(),
}));

function renderCreate(onCreated = vi.fn(), onDirtyChange = vi.fn()) {
  render(
    <I18nProvider>
      <ToastProvider>
        <ItemCreate
          categoryId="cat-1"
          onCreated={onCreated}
          onDirtyChange={onDirtyChange}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onCreated, onDirtyChange };
}

describe('ItemCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('renders a blank form the user can fill in', async () => {
    renderCreate();
    expect(await screen.findByTestId('item-title')).toHaveValue('');
  });

  it('creates the item and resets the form on success', async () => {
    vi.mocked(createItem).mockResolvedValue({
      data: { id: 'item-1' },
      error: null,
    } as never);
    vi.mocked(linkItemToCategory).mockResolvedValue({ error: null } as never);
    const user = userEvent.setup();
    const { onCreated } = renderCreate();

    const title = await screen.findByTestId('item-title');
    await user.type(title, 'Roman coin');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Roman coin' }),
    );
    expect(linkItemToCategory).toHaveBeenCalledWith('item-1', 'cat-1');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('item-title')).toHaveValue('');
  });

  it('leaves the form untouched when creation fails', async () => {
    vi.mocked(createItem).mockResolvedValue({
      data: null,
      error: new Error('boom'),
    } as never);
    const user = userEvent.setup();
    const { onCreated } = renderCreate();

    const title = await screen.findByTestId('item-title');
    await user.type(title, 'Roman coin');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('item-title')).toHaveValue('Roman coin');
  });

  it('forwards dirty-state changes from the form', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = renderCreate();
    onDirtyChange.mockClear();

    await user.type(await screen.findByTestId('item-title'), 'x');

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
