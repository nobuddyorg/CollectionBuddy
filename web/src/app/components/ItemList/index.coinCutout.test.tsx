// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  defaultImagesState,
  item,
  itemsState,
  renderList,
  resetHookMocks,
} from './index.test-support';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

const useItemsMock = vi.fn();
vi.mock('./useItems', () => ({
  useItems: (...args: unknown[]) =>
    useItemsMock(...args) as ReturnType<typeof useItems>,
}));

const useItemImagesMock = vi.fn();
vi.mock('./useItemImages', () => ({
  useItemImages: (...args: unknown[]) =>
    useItemImagesMock(...args) as ReturnType<typeof useItemImages>,
}));

const useItemMutationsMock = vi.fn();
vi.mock('./useItemMutations', () => ({
  useItemMutations: (...args: unknown[]) =>
    useItemMutationsMock(...args) as ReturnType<typeof useItemMutations>,
}));

// The feature's import() sites, spied on but still loading the real review.
const load = vi.hoisted(() => ({
  loadCoinCutout: vi.fn(),
  loadCutoutReview: vi.fn(),
}));
vi.mock('../CoinCutout/load', () => load);

// No model in tests: the cut-out itself is always a stand-in.
const cutOutCoin = vi.hoisted(() => vi.fn());
vi.mock('../../lib/coinCutout', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/coinCutout')>()),
  cutOutCoin,
}));

const photo = new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' });

function renderWithUpload() {
  const uploadImage = vi.fn(async () => {});
  useItemImagesMock.mockReturnValue({ ...defaultImagesState(), uploadImage });
  renderList();
  return uploadImage;
}

async function pickPhoto() {
  const card = screen.getByTestId('item-card');
  await userEvent.upload(within(card).getAllByTestId('upload-photo')[0], photo);
}

beforeEach(() => {
  resetHookMocks({ useItemsMock, useItemImagesMock, useItemMutationsMock });
  localStorage.removeItem('coinCutout');
  useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
  load.loadCoinCutout.mockReset();
  load.loadCutoutReview
    .mockReset()
    .mockImplementation(() => import('../CoinCutout/CutoutReview'));
  cutOutCoin.mockReset();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    }),
  );
});

describe('ItemList coin cut-out', () => {
  it('uploads a picked photo directly, loading nothing of the feature, while the opt-in is off', async () => {
    const uploadImage = renderWithUpload();

    await pickPhoto();

    expect(uploadImage).toHaveBeenCalledWith('1', photo);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(load.loadCutoutReview).not.toHaveBeenCalled();
    expect(load.loadCoinCutout).not.toHaveBeenCalled();
    expect(cutOutCoin).not.toHaveBeenCalled();
  });

  it('falls back to the original when the cut-out fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('coinCutout', 'on');
    cutOutCoin.mockRejectedValue(new Error('HTTP 404'));
    const uploadImage = renderWithUpload();

    await pickPhoto();

    const dialog = screen.getByRole('dialog', { name: 'Remove background' });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(
      await within(dialog).findByText(/The background could not be removed/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep original' }),
    );
    expect(uploadImage).toHaveBeenCalledWith('1', photo);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uploads the accepted cut-out as a transparent PNG', async () => {
    localStorage.setItem('coinCutout', 'on');
    const blob = new Blob(['png'], { type: 'image/png' });
    cutOutCoin.mockResolvedValue({
      blob,
      width: 4,
      height: 4,
      mode: 'ellipse',
      fillRatio: 1,
    });
    const uploadImage = renderWithUpload();

    await pickPhoto();
    const use = await screen.findByRole('button', { name: 'Use cut-out' });
    await vi.waitFor(() => expect(use).toBeEnabled());
    await userEvent.click(use);

    expect(uploadImage).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ type: 'image/png' }),
      'transparent',
    );
  });
});
