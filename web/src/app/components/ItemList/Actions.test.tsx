// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { stubCoarsePointer } from '../../lib/useCameraCapture.test-support';
import { Actions, AddPhotoPlate } from './Actions';

// A failed prefetch of the lazy ItemForm chunk must be swallowed, not surfaced as an unhandled rejection.
vi.mock('../ItemForm', () => {
  throw new Error('chunk load failed');
});

function renderActions(overrides: Partial<Parameters<typeof Actions>[0]> = {}) {
  const props = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onUpload: vi.fn(),
    busy: false,
    ...overrides,
  };
  render(
    <I18nProvider>
      <Actions {...props} />
    </I18nProvider>,
  );
  const input = screen.getByTestId<HTMLInputElement>('upload-photo');
  return { ...props, input };
}

describe('Actions', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  // Icon-only controls: names exist solely in the accessibility tree.
  it('names every action for assistive tech', () => {
    const { input } = renderActions();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
    expect(screen.getByLabelText('Add image')).toBe(input);
  });

  it('carries the upload control alongside edit and delete', () => {
    const { input } = renderActions();
    expect(input).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // Spelled-out labels overflow the card in German, so each control is an icon with a title.
  it('gives each control a title so the icon is not the only cue', () => {
    renderActions();
    expect(screen.getByTitle('Add image')).toBeInTheDocument();
    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete entry')).toBeInTheDocument();
  });

  it('hands the chosen file to onUpload', async () => {
    const { onUpload, input } = renderActions();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  // A retry after a failed upload picks the very same file, which an input still holding it ignores.
  it('hands over the same file again when it is picked a second time', async () => {
    const { onUpload, input } = renderActions();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it('does not call onUpload when the picker is dismissed with no file chosen', () => {
    const { onUpload, input } = renderActions();
    fireEvent.change(input, { target: { files: [] } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('does not call onUpload when the input reports no file list at all', () => {
    const { onUpload, input } = renderActions();
    fireEvent.change(input, { target: { files: null } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderActions({ busy: true });
    expect(input).toBeDisabled();
  });

  it('takes several photos in one pick, handed over in the order picked', async () => {
    const { onUpload, input } = renderActions();
    const first = new File(['1'], 'a.png', { type: 'image/png' });
    const second = new File(['2'], 'b.png', { type: 'image/png' });

    expect(input).toHaveAttribute('multiple');
    await userEvent.upload(input, [first, second]);

    expect(onUpload).toHaveBeenCalledExactlyOnceWith([first, second]);
  });

  it('offers no camera where there is none to open', () => {
    renderActions();
    expect(screen.queryByTestId('take-photo')).toBeNull();
    expect(screen.getByLabelText('Add image')).toBeInTheDocument();
  });

  describe('on a touch device', () => {
    beforeEach(() => stubCoarsePointer(true));
    afterEach(() => vi.restoreAllMocks());

    it('offers Take photo and Choose from files as two explicit choices', () => {
      renderActions();

      const camera = screen.getByTestId<HTMLInputElement>('take-photo');
      expect(camera).toBe(screen.getByLabelText('Take photo'));
      expect(camera).toHaveAttribute('accept', 'image/*');
      expect(camera).toHaveAttribute('capture', 'environment');
      expect(screen.getByLabelText('Choose from files')).toBe(
        screen.getByTestId('upload-photo'),
      );
      expect(screen.getByTitle('Take photo')).toBeInTheDocument();
      expect(screen.getByTitle('Choose from files')).toBeInTheDocument();
    });

    it('takes one shot at a time, handed over like any picked photo', async () => {
      const { onUpload } = renderActions();
      const camera = screen.getByTestId<HTMLInputElement>('take-photo');
      const shot = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' });

      expect(camera).not.toHaveAttribute('multiple');
      await userEvent.upload(camera, shot);
      await userEvent.upload(camera, shot);

      expect(onUpload).toHaveBeenCalledTimes(2);
      expect(onUpload).toHaveBeenLastCalledWith([shot]);
    });

    it('blocks the camera while an upload is in flight', () => {
      renderActions({ busy: true });
      expect(screen.getByTestId('take-photo')).toBeDisabled();
    });
  });

  it('swallows a failed prefetch of the edit form rather than surfacing it', async () => {
    const onUnhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    try {
      renderActions();
      fireEvent.focus(screen.getByRole('button', { name: 'Edit' }));
      // Give the dynamic import's rejection a turn to reach .catch().
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onUnhandledRejection).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    }
  });

  it('fires edit and delete handlers', async () => {
    const props = renderActions();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
});

function renderPlate(
  overrides: Partial<Parameters<typeof AddPhotoPlate>[0]> = {},
) {
  const props = { onUpload: vi.fn(), busy: false, ...overrides };
  render(
    <I18nProvider>
      <AddPhotoPlate {...props} />
    </I18nProvider>,
  );
  const input = screen.getByTestId<HTMLInputElement>('upload-photo');
  return { props, input };
}

describe('AddPhotoPlate', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('names the empty condition as well as the way out of it', () => {
    renderPlate();
    expect(screen.getByText('No images')).toBeVisible();
    expect(screen.getByText('Add image')).toBeVisible();
  });

  it('is itself the upload target, so an empty card needs no second control', async () => {
    const { props, input } = renderPlate();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    expect(props.onUpload).toHaveBeenCalledWith([file]);
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderPlate({ busy: true });
    expect(input).toBeDisabled();
  });

  it('shows a visible busy indicator while uploading', () => {
    renderPlate({ busy: true });
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeVisible();
  });

  it('takes several photos in one pick', async () => {
    const { props, input } = renderPlate();
    const first = new File(['1'], 'a.png', { type: 'image/png' });
    const second = new File(['2'], 'b.png', { type: 'image/png' });

    expect(input).toHaveAttribute('multiple');
    await userEvent.upload(input, [first, second]);

    expect(props.onUpload).toHaveBeenCalledExactlyOnceWith([first, second]);
  });

  it('offers no camera where there is none to open', () => {
    renderPlate();
    expect(screen.queryByTestId('take-photo')).toBeNull();
  });

  describe('on a touch device', () => {
    beforeEach(() => stubCoarsePointer(true));
    afterEach(() => vi.restoreAllMocks());

    it('offers Take photo beside Choose from files', async () => {
      const { props, input } = renderPlate();
      const camera = screen.getByTestId<HTMLInputElement>('take-photo');
      const shot = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' });

      expect(screen.getByText('Choose from files')).toBeVisible();
      expect(screen.getByText('Take photo')).toBeVisible();
      expect(screen.queryByText('Add image')).toBeNull();
      expect(camera).toHaveAttribute('capture', 'environment');
      expect(camera).not.toHaveAttribute('multiple');
      expect(camera).not.toHaveAttribute('capture', 'user');
      expect(input).not.toHaveAttribute('capture');

      await userEvent.upload(camera, shot);
      expect(props.onUpload).toHaveBeenCalledExactlyOnceWith([shot]);
    });

    it('keeps the camera outside the file label, which holds one control', () => {
      renderPlate();
      const camera = screen.getByTestId('take-photo');
      expect(camera.closest('label')).not.toContainElement(
        screen.getByTestId('upload-photo'),
      );
    });

    it('blocks the camera while an upload is in flight', () => {
      renderPlate({ busy: true });
      expect(screen.getByTestId('take-photo')).toBeDisabled();
    });

    it('offers neither choice on a read-only card', () => {
      render(
        <I18nProvider>
          <AddPhotoPlate onUpload={vi.fn()} busy={false} readOnly />
        </I18nProvider>,
      );
      expect(screen.getByText('No images')).toBeVisible();
      expect(screen.queryByTestId('take-photo')).toBeNull();
      expect(screen.queryByTestId('upload-photo')).toBeNull();
    });
  });
});
