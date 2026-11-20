// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ManualCropControls } from './ManualCropControls';
import { ManualCropView } from './ManualCropView';
import type { ImageEntry } from './types';
import type { ManualCrop } from './useManualCrop';

type Framing = Extract<ManualCrop, { kind: 'framing' }>;

const image: ImageEntry = {
  id: 'image-1',
  pathFull: 'user/item/photo.webp',
  urlFull: 'https://example.test/photo.webp',
};
const FRAME = { x: 100, y: 60, width: 400, height: 300 };
const crop = (overrides: Partial<Framing> = {}): Framing => ({
  kind: 'framing',
  image,
  size: { width: 1000, height: 600 },
  frame: FRAME,
  locked: true,
  saving: false,
  ...overrides,
});

function renderView(framing = crop()) {
  const actions = { move: vi.fn(), resize: vi.fn() };
  render(
    <I18nProvider>
      <ManualCropView
        image={image}
        alt="The photo"
        crop={framing}
        actions={actions}
        backdropClass=""
      />
    </I18nProvider>,
  );
  // Shown at half its stored size: a screen pixel is two of the photo's.
  vi.spyOn(
    screen.getByTestId('manual-crop'),
    'getBoundingClientRect',
  ).mockReturnValue({ width: 500, height: 300 } as DOMRect);
  return actions;
}

// jsdom has no pointer capture.
const setPointerCapture = vi.fn();

beforeEach(() => {
  window.localStorage.setItem('lang', 'en');
  setPointerCapture.mockClear();
  HTMLElement.prototype.setPointerCapture = setPointerCapture;
});

describe('ManualCropView', () => {
  it('places the frame over the photo in shares of it, so it follows any size the photo is shown at', () => {
    renderView();

    const placed = screen.getByTestId('crop-frame').parentElement!;
    expect(placed.style).toMatchObject({
      left: '10%',
      top: '10%',
      width: '40%',
      height: '50%',
    });
    expect(screen.getByRole('img', { name: 'The photo' })).toHaveAttribute(
      'src',
      image.urlFull,
    );
  });

  it('moves the frame by a drag, in photo pixels, from where the drag began', () => {
    const actions = renderView();
    const frame = screen.getByTestId('crop-frame');

    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 25, clientY: 5 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 40, clientY: 30 });

    expect(actions.move).toHaveBeenNthCalledWith(1, FRAME, { x: 30, y: -10 });
    expect(actions.move).toHaveBeenNthCalledWith(2, FRAME, { x: 60, y: 40 });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('resizes from the corner whose handle is dragged', () => {
    const actions = renderView();
    const handle = screen.getByTestId('crop-handle-top-left');

    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: -5, clientY: 10 });

    expect(actions.resize).toHaveBeenCalledWith(FRAME, 'top-left', {
      x: -10,
      y: 20,
    });
    expect(actions.move).not.toHaveBeenCalled();
  });

  it('stops following the pointer once it is lifted, or the browser takes it', () => {
    const actions = renderView();
    const handle = screen.getByTestId('crop-handle-bottom-right');

    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 3 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 50, clientY: 50 });
    fireEvent.pointerDown(handle, { pointerId: 4, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(handle, { pointerId: 4 });
    fireEvent.pointerMove(handle, { pointerId: 4, clientX: 50, clientY: 50 });

    expect(actions.resize).not.toHaveBeenCalled();
  });

  it('moves the frame with the arrow keys, a hundredth of the photo a press, a tenth with Shift', async () => {
    const actions = renderView();
    screen.getByTestId('crop-frame').focus();

    await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowUp}{/Shift}');

    expect(actions.move).toHaveBeenNthCalledWith(1, FRAME, { x: 10, y: 0 });
    expect(actions.move).toHaveBeenNthCalledWith(2, FRAME, { x: 0, y: -100 });
  });

  it('resizes from a focused corner with the arrow keys, and ignores every other key', async () => {
    const actions = renderView();
    screen.getByTestId('crop-handle-bottom-left').focus();

    await userEvent.keyboard('{ArrowLeft}{Enter}a');

    expect(actions.resize).toHaveBeenCalledOnce();
    expect(actions.resize).toHaveBeenCalledWith(FRAME, 'bottom-left', {
      x: -10,
      y: 0,
    });
  });

  it('names the frame and every corner for a screen reader', () => {
    renderView();

    expect(
      screen.getByRole('button', { name: /^Crop frame/ }),
    ).toBeInTheDocument();
    for (const corner of [
      'Top-left',
      'Top-right',
      'Bottom-left',
      'Bottom-right',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${corner} corner`) }),
      ).toBeInTheDocument();
    }
  });
});

describe('ManualCropControls', () => {
  function renderControls(framing = crop(), busy = false) {
    const actions = {
      toggleLock: vi.fn(),
      cancel: vi.fn(),
      save: vi.fn(async () => {}),
    };
    render(
      <I18nProvider>
        <ManualCropControls crop={framing} actions={actions} busy={busy} />
      </I18nProvider>,
    );
    return actions;
  }

  it('saves, cancels and toggles the card’s 4:3', async () => {
    const actions = renderControls();

    expect(screen.getByTestId('manual-crop-lock')).toBeChecked();
    await userEvent.click(screen.getByTestId('manual-crop-lock'));
    await userEvent.click(screen.getByTestId('manual-crop-save'));
    await userEvent.click(screen.getByTestId('manual-crop-cancel'));

    expect(actions.toggleLock).toHaveBeenCalledOnce();
    expect(actions.save).toHaveBeenCalledOnce();
    expect(actions.cancel).toHaveBeenCalledOnce();
  });

  it('has nothing to save while the frame keeps the whole photo', () => {
    renderControls(crop({ frame: { x: 0, y: 0, width: 1000, height: 600 } }));

    expect(screen.getByTestId('manual-crop-save')).toBeDisabled();
  });

  it('waits for another change to the photos before saving', () => {
    renderControls(crop(), true);

    expect(screen.getByTestId('manual-crop-save')).toBeDisabled();
  });

  it('holds everything but the spinner while saving', () => {
    renderControls(crop({ saving: true }));

    expect(screen.getByTestId('manual-crop-save')).toBeDisabled();
    expect(screen.getByTestId('manual-crop-save')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByTestId('manual-crop-cancel')).toBeDisabled();
    expect(screen.getByTestId('manual-crop-lock')).toBeDisabled();
  });

  it('explains how to frame the crop', () => {
    renderControls();

    expect(screen.getByTestId('manual-crop-hint')).toHaveTextContent(
      'Drag the frame to move it, or a corner to resize it.',
    );
  });
});
