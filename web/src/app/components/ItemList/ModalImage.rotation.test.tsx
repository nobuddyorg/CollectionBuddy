// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoInspection } from '../../lib/photoRotation';
import {
  mountAppRoot,
  removeAppRoot,
} from '../CenteredModal/appRoot.test-support';
import { ToastWrapper } from '../providers.test-support';
import { ModalImage } from './ModalImage';
import type { ImageEntry } from './types';

const downloadImageObject = vi.hoisted(() => vi.fn());
vi.mock('../../data/images', () => ({ downloadImageObject }));
const inspectForRotation = vi.hoisted(() =>
  vi.fn<(file: Blob) => Promise<PhotoInspection>>(),
);
vi.mock('../../lib/photoRotation', () => ({ inspectForRotation }));

const photo = (name: string): ImageEntry => ({
  id: `id-${name}`,
  pathFull: `${name}.webp`,
  urlFull: `https://example.test/${name}.webp`,
});
const source = new Blob(['stored'], { type: 'image/webp' });
const OPAQUE: PhotoInspection = {
  transparent: false,
  straightening: { kind: 'none' },
};
const TILTED_CUT_OUT: PhotoInspection = {
  transparent: true,
  straightening: { kind: 'straighten', degrees: -3.5 },
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
    onRotate: vi.fn(async () => {}),
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

/** The shown photo, loaded at a stored size of 1000 × 750. */
function loadPhoto() {
  const shown = screen.getByTestId('viewer-photo');
  Object.defineProperties(shown, {
    naturalWidth: { configurable: true, value: 1000 },
    naturalHeight: { configurable: true, value: 750 },
  });
  fireEvent.load(shown);
}

async function startRotating() {
  await userEvent.click(screen.getByTestId('rotate-image'));
  // The stored photo's reading settles.
  await act(async () => {});
}

const controls = () => screen.getByTestId('rotation-controls');

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  window.localStorage.removeItem('photoBackdrop');
  mountAppRoot();
  downloadImageObject.mockReset();
  downloadImageObject.mockResolvedValue({ data: source, error: null });
  inspectForRotation.mockReset();
  inspectForRotation.mockResolvedValue(OPAQUE);
});

afterEach(removeAppRoot);

describe('rotating the shown photo', () => {
  it('is offered to an editor with an accessible name', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeEnabled();
  });

  it('is not offered to a viewer of a shared collection', () => {
    renderModal({ readOnly: true });
    expect(screen.queryByTestId('rotate-image')).not.toBeInTheDocument();
  });

  it('waits while the entry is busy', () => {
    renderModal({ busy: true });
    expect(screen.getByTestId('rotate-image')).toBeDisabled();
  });

  it('opens its tools in place of Previous and Next, and holds the other tools meanwhile', async () => {
    renderModal({ offerRemoveBackground: true });

    await startRotating();

    expect(
      screen.getByRole('group', { name: 'Rotate photo' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('previous-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('delete-image')).toBeDisabled();
    expect(screen.getByTestId('remove-background-image')).toBeDisabled();
    expect(screen.getByTestId('rotate-image')).toBeDisabled();
    expect(downloadImageObject).toHaveBeenCalledWith('a.webp');
  });

  it('names every tool', async () => {
    inspectForRotation.mockResolvedValue(TILTED_CUT_OUT);
    renderModal();
    await startRotating();

    const tools = within(controls());
    for (const name of [
      'Rotate left',
      'Rotate right',
      'Straighten',
      'Reset',
      'Cancel',
      'Save',
    ]) {
      expect(tools.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(tools.getByRole('slider', { name: 'Angle' })).toHaveAttribute(
      'aria-valuetext',
      '0°',
    );
  });

  it('says it is still reading the photo, and cannot save before it has', async () => {
    inspectForRotation.mockReturnValue(new Promise(() => {}));
    renderModal();
    await userEvent.click(screen.getByTestId('rotate-image'));
    await userEvent.click(screen.getByTestId('rotate-right'));

    expect(
      within(controls()).getByRole('status', { name: 'Reading the photo…' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('rotation-save')).toBeDisabled();
  });

  it('previews a quarter turn live, framed as it will be stored', async () => {
    renderModal();
    loadPhoto();
    await startRotating();

    await userEvent.click(screen.getByTestId('rotate-right'));

    expect(screen.getByTestId('viewer-photo').style.transform).toBe(
      'translate(-50%, -50%) rotate(90deg)',
    );
    expect(screen.getByTestId('rotation-preview').style.aspectRatio).toBe(
      '750 / 1000',
    );

    await userEvent.click(screen.getByTestId('rotate-left'));
    await userEvent.click(screen.getByTestId('rotate-left'));
    expect(screen.getByTestId('viewer-photo').style.transform).toBe(
      'translate(-50%, -50%) rotate(270deg)',
    );
  });

  it('turns by the slider’s angle and says the angle', async () => {
    renderModal();
    loadPhoto();
    await startRotating();

    fireEvent.change(screen.getByTestId('rotation-angle'), {
      target: { value: '3.5' },
    });

    expect(screen.getByTestId('rotation-angle-value')).toHaveTextContent(
      '3.5°',
    );
    expect(screen.getByTestId('rotation-angle')).toHaveAttribute(
      'aria-valuetext',
      '3.5°',
    );
    expect(screen.getByTestId('viewer-photo').style.transform).toBe(
      'translate(-50%, -50%) rotate(3.5deg)',
    );
  });

  it('says the angle the German way in German', async () => {
    window.localStorage.setItem('lang', 'de');
    renderModal();
    await startRotating();

    fireEvent.change(screen.getByTestId('rotation-angle'), {
      target: { value: '-2.5' },
    });

    expect(screen.getByTestId('rotation-angle-value')).toHaveTextContent(
      '-2,5°',
    );
  });

  it('offers a cut-out’s straightening and previews it once taken, until reset', async () => {
    inspectForRotation.mockResolvedValue(TILTED_CUT_OUT);
    renderModal();
    loadPhoto();
    await startRotating();
    expect(screen.getByTestId('rotation-reset')).toBeDisabled();

    await userEvent.click(screen.getByTestId('straighten-image'));

    expect(screen.getByTestId('rotation-angle')).toHaveValue('-3.5');
    expect(screen.getByTestId('viewer-photo').style.transform).toBe(
      'translate(-50%, -50%) rotate(-3.5deg)',
    );
    expect(screen.getByTestId('straighten-image')).toBeDisabled();

    await userEvent.click(screen.getByTestId('rotation-reset'));
    expect(screen.getByTestId('rotation-angle')).toHaveValue('0');
    expect(screen.getByTestId('straighten-image')).toBeEnabled();
  });

  it('offers no straightening for a photo whose outline suggests none', async () => {
    renderModal();
    await startRotating();
    expect(screen.queryByTestId('straighten-image')).not.toBeInTheDocument();
  });

  it('keeps a cut-out’s corners on the chosen backdrop, and crops nothing of it', async () => {
    window.localStorage.setItem('photoBackdrop', 'black');
    inspectForRotation.mockResolvedValue(TILTED_CUT_OUT);
    renderModal();
    loadPhoto();
    await startRotating();

    fireEvent.change(screen.getByTestId('rotation-angle'), {
      target: { value: '30' },
    });

    const frame = screen.getByTestId('rotation-preview');
    expect(frame).toHaveClass('bg-black');
    expect(frame.style.aspectRatio).toBe('1242 / 1150');
  });

  it('frames an opaque photo by its crop, nothing behind it', async () => {
    window.localStorage.setItem('photoBackdrop', 'black');
    renderModal();
    loadPhoto();
    await startRotating();

    fireEvent.change(screen.getByTestId('rotation-angle'), {
      target: { value: '10' },
    });

    const frame = screen.getByTestId('rotation-preview');
    expect(frame).not.toHaveClass('bg-black');
    expect(frame.style.aspectRatio).toBe('909 / 601');
  });

  it('saves the one turn, then closes its tools', async () => {
    const { onRotate } = renderModal();
    await startRotating();
    expect(screen.getByTestId('rotation-save')).toBeDisabled();

    await userEvent.click(screen.getByTestId('rotate-left'));
    fireEvent.change(screen.getByTestId('rotation-angle'), {
      target: { value: '-1.5' },
    });
    await userEvent.click(screen.getByTestId('rotation-save'));

    expect(onRotate).toHaveBeenCalledExactlyOnceWith(photo('a'), {
      source,
      degrees: 268.5,
    });
    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('previous-image')).toBeInTheDocument();
  });

  it('saves to nothing without a handler, by default, and closes its tools', async () => {
    renderModal({ onRotate: undefined });
    await startRotating();
    await userEvent.click(screen.getByTestId('rotate-right'));

    await userEvent.click(screen.getByTestId('rotation-save'));

    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
  });

  it('shows it is saving and holds every tool until the save is in', async () => {
    let finish!: () => void;
    renderModal({
      onRotate: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    await startRotating();
    await userEvent.click(screen.getByTestId('rotate-right'));

    await userEvent.click(screen.getByTestId('rotation-save'));

    expect(screen.getByTestId('rotation-save')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    for (const tool of [
      'rotate-left',
      'rotate-right',
      'rotation-angle',
      'rotation-reset',
      'rotation-cancel',
      'rotation-save',
    ]) {
      expect(screen.getByTestId(tool)).toBeDisabled();
    }
    await act(async () => finish());
    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
  });

  it('holds its tools while another change to the entry’s photos is on its way', async () => {
    const view = renderModal();
    await startRotating();
    await userEvent.click(screen.getByTestId('rotate-right'));

    view.rerender({ busy: true });

    expect(screen.getByTestId('rotate-right')).toBeDisabled();
    expect(screen.getByTestId('rotation-save')).toBeDisabled();
    expect(screen.getByTestId('rotation-cancel')).toBeEnabled();
  });

  it('changes nothing on Cancel', async () => {
    const { onRotate } = renderModal();
    await startRotating();
    await userEvent.click(screen.getByTestId('rotate-right'));

    await userEvent.click(screen.getByTestId('rotation-cancel'));

    expect(onRotate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
  });

  it('cancels on Escape and leaves the viewer open; the next Escape closes it', async () => {
    const { onClose } = renderModal();
    await startRotating();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves the arrow keys to the slider rather than paging', async () => {
    const { onIndexChange } = renderModal();
    await startRotating();

    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('pages on no swipe and closes on no tap of the photo meanwhile', async () => {
    const { onIndexChange, onClose } = renderModal();
    await startRotating();
    const dialog = screen.getByTestId('image-viewer');

    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, {
      changedTouches: [{ clientX: 50, clientY: 100 }],
    });
    await userEvent.click(screen.getByTestId('viewer-photo'));

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drops the rotation when the viewer is closed, so it opens unturned next time', async () => {
    const view = renderModal();
    await startRotating();
    await userEvent.click(screen.getByTestId('rotate-right'));

    await userEvent.click(screen.getByTestId('close-image'));
    expect(view.onClose).toHaveBeenCalledOnce();
    view.rerender({ index: null });
    view.rerender({ index: 0 });

    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
  });

  it('shows no rotation for a photo it was not opened on', async () => {
    const view = renderModal();
    await startRotating();

    view.rerender({ images: [photo('b')] });

    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('rotate-image')).toBeEnabled();
  });

  it('closes its tools and says so when the photo cannot be read', async () => {
    downloadImageObject.mockResolvedValue({
      data: null,
      error: new Error('Object not found'),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderModal();

    await startRotating();

    expect(screen.queryByTestId('rotation-controls')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This photo could not be loaded to rotate it.',
    );
  });
});
