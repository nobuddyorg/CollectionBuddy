// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CropResult, CutOutOptions } from '../../lib/backgroundRemoval';
import {
  mountAppRoot,
  removeAppRoot,
} from '../CenteredModal/appRoot.test-support';
import { ToastWrapper } from '../providers.test-support';
import { ModalImage } from './ModalImage';
import type { ImageEntry } from './types';

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', () => ({ downloadImageObject }));

class NoObjectFoundError extends Error {}
const cropToObject = vi.hoisted(() =>
  vi.fn<(file: Blob, options: CutOutOptions) => Promise<CropResult>>(),
);
vi.mock('../BackgroundRemoval/load', () => ({
  loadBackgroundRemoval: async () => ({ cropToObject, NoObjectFoundError }),
}));

const photo = (name: string): ImageEntry => ({
  id: `id-${name}`,
  pathFull: `${name}.webp`,
  urlFull: `https://example.test/${name}.webp`,
});
const source = new Blob(['stored'], { type: 'image/webp' });
const crop = {
  blob: new Blob(['png'], { type: 'image/png' }),
  width: 400,
  height: 300,
  transparent: false,
};

function renderModal(
  overrides: Partial<Parameters<typeof ModalImage>[0]> = {},
) {
  const props = {
    images: [photo('a'), photo('b')],
    index: 0 as number | null,
    itemTitle: 'Blue Mauritius',
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onCrop: vi.fn(async () => {}),
    offerRemoveBackground: true,
    ...overrides,
  };
  const view = render(
    <ToastWrapper>
      <ModalImage {...props} />
    </ToastWrapper>,
  );
  return {
    ...props,
    rerender: (next: Partial<Parameters<typeof ModalImage>[0]>) =>
      view.rerender(
        <ToastWrapper>
          <ModalImage {...{ ...props, ...next }} />
        </ToastWrapper>,
      ),
  };
}

async function startCropping() {
  await userEvent.click(screen.getByTestId('crop-image'));
  // The stored photo's download and the worker's answer settle.
  await act(async () => {});
}

const status = () => screen.getByTestId('crop-status');

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  window.localStorage.removeItem('photoBackdrop');
  mountAppRoot();
  downloadImageObject.mockReset();
  downloadImageObject.mockResolvedValue({ data: source, error: null });
  cropToObject.mockReset();
  cropToObject.mockResolvedValue({ kind: 'cropped', crop });
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => 'blob:crop',
      revokeObjectURL: () => {},
    }),
  );
});

afterEach(removeAppRoot);

describe('cropping the shown photo to its item', () => {
  it('is offered to an editor who opted in to background removal, with an accessible name', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Crop to the item' }),
    ).toBeEnabled();
  });

  it('is not offered without background removal, which finds the item', () => {
    renderModal({ offerRemoveBackground: false });
    expect(screen.queryByTestId('crop-image')).not.toBeInTheDocument();
  });

  it('is not offered to a viewer of a shared collection', () => {
    renderModal({ readOnly: true });
    expect(screen.queryByTestId('crop-image')).not.toBeInTheDocument();
  });

  it('waits while the entry is busy', () => {
    renderModal({ busy: true });
    expect(screen.getByTestId('crop-image')).toBeDisabled();
  });

  it('says where it has got to, in place of Previous and Next, and holds the other tools meanwhile', async () => {
    let report!: CutOutOptions['onProgress'];
    cropToObject.mockImplementation((_file, options) => {
      report = options.onProgress;
      return new Promise(() => {});
    });
    renderModal();

    await userEvent.click(screen.getByTestId('crop-image'));
    expect(
      within(screen.getByRole('group', { name: 'Crop photo' })).getByTestId(
        'crop-status',
      ),
    ).toHaveTextContent('Reading the photo…');
    await vi.waitFor(() => expect(cropToObject).toHaveBeenCalled());
    act(() => report!({ stage: 'download', loaded: 1, total: 2 }));
    expect(status()).toHaveTextContent('Downloading model: 50%');
    act(() => report!({ stage: 'analyze' }));
    expect(status()).toHaveTextContent('Finding the item…');

    expect(screen.getByTestId('crop-save')).toBeDisabled();
    expect(screen.queryByTestId('previous-image')).not.toBeInTheDocument();
    for (const tool of [
      'delete-image',
      'remove-background-image',
      'rotate-image',
      'crop-image',
    ]) {
      expect(screen.getByTestId(tool)).toBeDisabled();
    }
  });

  it('shows the crop in the original’s place, and saves it as the upload', async () => {
    const { onCrop } = renderModal();
    await startCropping();

    expect(status()).toHaveTextContent('Cropped to the item');
    expect(screen.getByTestId('crop-preview')).toHaveAttribute(
      'src',
      'blob:crop',
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'The photo cropped to the item',
    );
    expect(screen.queryByTestId('viewer-photo')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('crop-save'));

    expect(onCrop).toHaveBeenCalledExactlyOnceWith(
      photo('a'),
      expect.objectContaining({ encoding: 'opaque' }),
    );
    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('viewer-photo')).toBeInTheDocument();
  });

  it('saves to nothing without a handler, by default', async () => {
    renderModal({ onCrop: undefined });
    await startCropping();

    await userEvent.click(screen.getByTestId('crop-save'));

    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
  });

  it('lays a see-through crop on the chosen backdrop, and an opaque one on none', async () => {
    window.localStorage.setItem('photoBackdrop', 'black');
    cropToObject.mockResolvedValue({
      kind: 'cropped',
      crop: { ...crop, transparent: true },
    });
    renderModal();
    await startCropping();
    expect(screen.getByTestId('crop-preview')).toHaveClass('bg-black');

    await userEvent.click(screen.getByTestId('crop-cancel'));
    cropToObject.mockResolvedValue({ kind: 'cropped', crop });
    await startCropping();
    expect(screen.getByTestId('crop-preview')).not.toHaveClass('bg-black');
  });

  it('shows it is saving and holds Cancel until the save is in', async () => {
    let finish!: () => void;
    renderModal({
      onCrop: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    await startCropping();

    await userEvent.click(screen.getByTestId('crop-save'));

    expect(screen.getByTestId('crop-save')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByTestId('crop-save')).toBeDisabled();
    expect(screen.getByTestId('crop-cancel')).toBeDisabled();
    await act(async () => finish());
    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
  });

  it('cannot save while another change to the entry’s photos is on its way', async () => {
    const view = renderModal();
    await startCropping();

    view.rerender({ busy: true });

    expect(screen.getByTestId('crop-save')).toBeDisabled();
  });

  it('says the photo is cropped to its item already, with nothing to save', async () => {
    cropToObject.mockResolvedValue({ kind: 'already-framed' });
    renderModal();
    await startCropping();

    expect(status()).toHaveTextContent(
      'This photo is cropped to its item already.',
    );
    expect(screen.getByTestId('crop-save')).toBeDisabled();
    expect(screen.getByTestId('viewer-photo')).toBeInTheDocument();
  });

  it('says when no item was found', async () => {
    cropToObject.mockRejectedValue(new NoObjectFoundError());
    renderModal();
    await startCropping();

    expect(status()).toHaveTextContent('No item was found in this photo');
  });

  it('changes nothing on Cancel', async () => {
    const { onCrop } = renderModal();
    await startCropping();

    await userEvent.click(screen.getByTestId('crop-cancel'));

    expect(onCrop).not.toHaveBeenCalled();
    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('viewer-photo')).toBeInTheDocument();
  });

  it('cancels on Escape and leaves the viewer open; the arrows page nothing meanwhile', async () => {
    const { onClose, onIndexChange } = renderModal();
    await startCropping();

    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops the crop when the viewer is closed', async () => {
    const view = renderModal();
    await startCropping();

    await userEvent.click(screen.getByTestId('close-image'));
    view.rerender({ index: null });
    view.rerender({ index: 0 });

    expect(view.onClose).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
  });

  it('shows no crop for a photo it was not started on', async () => {
    const view = renderModal();
    await startCropping();

    view.rerender({ images: [photo('b')] });

    expect(screen.queryByTestId('crop-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('crop-image')).toBeEnabled();
  });
});
