// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
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
  const { container } = render(
    <I18nProvider>
      <Actions {...props} />
    </I18nProvider>,
  );
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
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

  // Regression: spelled-out labels overflowed the card in German and were clipped.
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
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('does not call onUpload when the picker is dismissed with no file chosen', () => {
    const { onUpload, input } = renderActions();
    fireEvent.change(input, { target: { files: [] } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderActions({ busy: true });
    expect(input).toBeDisabled();
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
  const { container } = render(
    <I18nProvider>
      <AddPhotoPlate {...props} />
    </I18nProvider>,
  );
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
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
    expect(props.onUpload).toHaveBeenCalledWith(file);
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderPlate({ busy: true });
    expect(input).toBeDisabled();
  });

  it('shows a visible busy indicator while uploading', () => {
    renderPlate({ busy: true });
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeVisible();
  });
});
