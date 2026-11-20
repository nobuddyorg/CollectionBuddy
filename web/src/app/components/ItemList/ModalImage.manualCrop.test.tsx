// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoUpload } from '../../data/photoType';
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
const cropPhotoToFrame = vi.hoisted(() => vi.fn());
vi.mock('../../lib/photoFrameCrop', () => ({ cropPhotoToFrame }));

class NoObjectFoundError extends Error {}
const cropToObject = vi.hoisted(() =>
  vi.fn<(file: Blob, options: CutOutOptions) => Promise<CropResult>>(),
);
vi.mock('../BackgroundRemoval/load', () => ({
  loadBackgroundRemoval: async () => ({
    cropToObject,
    removeBackground: vi.fn(),
    NoObjectFoundError,
  }),
}));

const photo = (name: string): ImageEntry => ({
  id: `id-${name}`,
  pathFull: `${name}.webp`,
  urlFull: `https://example.test/${name}.webp`,
});
const source = new Blob(['stored'], { type: 'image/webp' });
const cropped: PhotoUpload = {
  file: new File(['png'], 'cropped.png', { type: 'image/png' }),
  encoding: 'opaque',
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
    onEdit: vi.fn(async () => {}),
    offerRemoveBackground: false,
    ...overrides,
  };
  render(
    <ToastWrapper>
      <ModalImage {...props} />
    </ToastWrapper>,
  );
  return props;
}

/** The viewer's photo finishes loading at its stored size. */
function photoLoads(size = { width: 800, height: 600 }) {
  const shown = screen.getByTestId('viewer-photo');
  Object.defineProperties(shown, {
    naturalWidth: { value: size.width },
    naturalHeight: { value: size.height },
  });
  fireEvent.load(shown);
}

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  mountAppRoot();
  downloadImageObject.mockReset();
  downloadImageObject.mockResolvedValue({ data: source, error: null });
  cropPhotoToFrame.mockReset();
  cropPhotoToFrame.mockResolvedValue(cropped);
  cropToObject.mockReset();
});
afterEach(() => {
  removeAppRoot();
});

describe('ModalImage: crop by hand', () => {
  // It needs no model, so it is not behind the background-removal opt-in.
  it('is offered to an editor without background removal, once the photo has loaded', () => {
    renderModal();

    expect(screen.getByTestId('crop-by-hand')).toBeDisabled();
    expect(screen.queryByTestId('crop-image')).not.toBeInTheDocument();
    photoLoads();
    expect(screen.getByTestId('crop-by-hand')).toBeEnabled();
  });

  it('is not offered to someone the collection is only shared with to view', () => {
    renderModal({ readOnly: true });

    expect(screen.queryByTestId('crop-by-hand')).not.toBeInTheDocument();
  });

  it('frames the photo in its place, holding the viewer until Save or Cancel', async () => {
    const { onIndexChange, onClose } = renderModal();
    photoLoads();

    await userEvent.click(screen.getByTestId('crop-by-hand'));

    expect(screen.getByTestId('manual-crop')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-photo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('rotate-image')).toBeDisabled();
    await userEvent.keyboard('{ArrowRight}');
    expect(onIndexChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('manual-crop')).not.toBeInTheDocument();
    expect(screen.getByTestId('viewer-photo')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves the crop in the photo’s place, in its stored pixels', async () => {
    const { onEdit } = renderModal();
    photoLoads({ width: 800, height: 600 });
    await userEvent.click(screen.getByTestId('crop-by-hand'));

    await userEvent.click(screen.getByTestId('manual-crop-save'));
    await act(async () => {});

    // The starting 4:3 frame at nine tenths of an 800 x 600 photo.
    expect(cropPhotoToFrame).toHaveBeenCalledWith(source, {
      x: 40,
      y: 30,
      width: 720,
      height: 540,
    });
    expect(onEdit).toHaveBeenCalledWith(photo('a'), cropped);
    expect(screen.queryByTestId('manual-crop')).not.toBeInTheDocument();
  });

  it('offers a crop by hand where Crop to the item finds nothing', async () => {
    cropToObject.mockRejectedValue(new NoObjectFoundError());
    renderModal({ offerRemoveBackground: true });
    photoLoads();
    await userEvent.click(screen.getByTestId('crop-image'));
    await act(async () => {});

    await userEvent.click(screen.getByTestId('edit-crop-by-hand'));

    expect(screen.queryByTestId('edit-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('manual-crop-controls')).toBeInTheDocument();
  });

  it('offers no crop by hand where Crop to the item found the photo framed already', async () => {
    cropToObject.mockResolvedValue({ kind: 'already-framed' });
    renderModal({ offerRemoveBackground: true });
    photoLoads();
    await userEvent.click(screen.getByTestId('crop-image'));
    await act(async () => {});

    expect(screen.getByTestId('edit-status')).toHaveTextContent(
      'This photo is cropped to its item already.',
    );
    expect(screen.queryByTestId('edit-crop-by-hand')).not.toBeInTheDocument();
  });
});
