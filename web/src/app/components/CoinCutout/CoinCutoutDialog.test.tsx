// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';

vi.mock('./CutoutReview', () => ({
  default: ({ file }: { file: File }) => <p>Reviewing {file.name}</p>,
}));

import { CoinCutoutDialog } from './CoinCutoutDialog';

const pending = {
  itemId: 'item-1',
  file: new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' }),
};

function renderDialog(props: Parameters<typeof CoinCutoutDialog>[0]) {
  return render(
    <I18nProvider>
      <main id="main-content">
        <CoinCutoutDialog {...props} />
      </main>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem('lang', 'en');
});

describe('CoinCutoutDialog', () => {
  it('renders nothing while no photo waits for review', () => {
    renderDialog({ pending: null, onChoose: vi.fn() });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a labelled dialog and loads the review of the pending photo', async () => {
    renderDialog({ pending, onChoose: vi.fn() });

    expect(
      screen.getByRole('dialog', { name: 'Remove background' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Reviewing coin.jpg')).toBeInTheDocument();
  });

  it('cancels the upload when closed with Escape', async () => {
    const onChoose = vi.fn();
    renderDialog({ pending, onChoose });

    await userEvent.keyboard('{Escape}');

    expect(onChoose).toHaveBeenCalledWith({ kind: 'cancel' });
  });

  it('cancels the upload from its close button', async () => {
    const onChoose = vi.fn();
    renderDialog({ pending, onChoose });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onChoose).toHaveBeenCalledWith({ kind: 'cancel' });
  });
});
