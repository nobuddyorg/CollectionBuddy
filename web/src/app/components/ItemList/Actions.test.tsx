// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { Actions, AddPhotoPlate } from './Actions';

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

  // The controls are icon-only, so the names exist solely in the
  // accessibility tree -- there is no visible text to fall back on.
  it('names every action for assistive tech', () => {
    const { input } = renderActions();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
    expect(screen.getByLabelText('Add image')).toBe(input);
  });

  // All three things you can do to an entry sit in this one row; the upload
  // control used to be a full-width band across the middle of the card,
  // between the photograph and its caption.
  it('carries the upload control alongside edit and delete', () => {
    const { input } = renderActions();
    expect(input).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // Regression: spelled-out labels overflowed the card in German and were
  // clipped. Icons are fixed-width, but only work as controls if they are
  // also hoverable/tappable targets, which the shared icon button provides.
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

  it('does not call onUpload when the picker is dismissed', async () => {
    const { onUpload, input } = renderActions();
    await userEvent.upload(input, []);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderActions({ busy: true });
    expect(input).toBeDisabled();
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

  // The shared <Spinner> is white-on-dark; on this pale plate it would be
  // an invisible busy state.
  it('shows a visible busy indicator while uploading', () => {
    renderPlate({ busy: true });
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeVisible();
  });
});
