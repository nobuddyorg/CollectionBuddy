// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';

vi.mock('./CutoutReview', () => ({
  default: ({ file, sharpness }: { file: File; sharpness: string }) => (
    <p>
      Reviewing {file.name}, {sharpness}
    </p>
  ),
}));

import { BackgroundRemovalDialog } from './BackgroundRemovalDialog';
import type { QueuedPhoto } from './photoBatch';

const pending: QueuedPhoto = {
  key: '1:0',
  pick: 1,
  itemId: 'item-1',
  file: new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' }),
  removeBackground: true,
  position: { current: 1, total: 1 },
  sharpness: 'checking',
};

function renderDialog(props: Parameters<typeof BackgroundRemovalDialog>[0]) {
  return render(
    <I18nProvider>
      <main id="main-content">
        <BackgroundRemovalDialog {...props} />
      </main>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem('lang', 'en');
});

describe('BackgroundRemovalDialog', () => {
  it('renders nothing while no photo waits for review', () => {
    renderDialog({ pending: null, onChoose: vi.fn() });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a labelled dialog and loads the review of the pending photo', async () => {
    renderDialog({ pending, onChoose: vi.fn() });

    expect(
      screen.getByRole('dialog', { name: 'Remove background' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Reviewing coin.jpg, checking'),
    ).toBeInTheDocument();
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

  it('says nothing about progress for a single photo', async () => {
    renderDialog({ pending, onChoose: vi.fn() });
    await screen.findByText('Reviewing coin.jpg, checking');

    expect(screen.queryByTestId('cutout-progress')).toBeNull();
  });

  it('says which photo of several is under review', async () => {
    renderDialog({
      pending: { ...pending, position: { current: 2, total: 3 } },
      onChoose: vi.fn(),
    });

    expect(await screen.findByTestId('cutout-progress')).toHaveTextContent(
      'Photo 2 of 3',
    );
  });

  it('hands the review its verdict on blur', async () => {
    renderDialog({
      pending: { ...pending, sharpness: 'blurry' },
      onChoose: vi.fn(),
    });

    expect(
      await screen.findByText('Reviewing coin.jpg, blurry'),
    ).toBeInTheDocument();
  });

  it('asks about a blurry photo alone, without the cut-out, where background removal is off', () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    renderDialog({
      pending: { ...pending, removeBackground: false, sharpness: 'blurry' },
      onChoose: vi.fn(),
    });

    expect(
      screen.getByRole('dialog', { name: 'Blurry photo' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('blur-review')).toBeInTheDocument();
    expect(screen.queryByText(/Reviewing/)).toBeNull();
    vi.unstubAllGlobals();
  });
});
