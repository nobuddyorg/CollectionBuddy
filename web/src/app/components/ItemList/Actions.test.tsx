// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { Actions, AddPhoto } from './Actions';

function renderActions(overrides: Partial<Parameters<typeof Actions>[0]> = {}) {
  const props = { onEdit: vi.fn(), onDelete: vi.fn(), ...overrides };
  render(
    <I18nProvider>
      <Actions {...props} />
    </I18nProvider>,
  );
  return props;
}

function renderAddPhoto(
  overrides: Partial<Parameters<typeof AddPhoto>[0]> = {},
) {
  const props = { onUpload: vi.fn(), busy: false, ...overrides };
  const { container } = render(
    <I18nProvider>
      <AddPhoto {...props} />
    </I18nProvider>,
  );
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { props, input };
}

describe('Actions', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  // Regression: these were bare icons floating over the photograph, on top
  // of the image's own delete control, so nothing said which destructive
  // action removed which thing.
  it('spells out what each action affects', () => {
    renderActions();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
  });

  // Regression: with the upload control in here too, three labelled items
  // could not fit one line in a desktop grid column and wrapped.
  it('leaves the upload control out of the caption row', () => {
    renderActions();
    expect(screen.queryByText('Add image')).not.toBeInTheDocument();
  });

  it('fires edit and delete handlers', async () => {
    const props = renderActions();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
});

describe('AddPhoto', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('is labelled so an item with no pictures still offers a way in', () => {
    renderAddPhoto();
    expect(screen.getByText('Add image')).toBeVisible();
  });

  it('hands the chosen file to onUpload', async () => {
    const { props, input } = renderAddPhoto();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    expect(props.onUpload).toHaveBeenCalledWith(file);
  });

  it('does not call onUpload when the picker is dismissed', async () => {
    const { props, input } = renderAddPhoto();
    await userEvent.upload(input, []);
    expect(props.onUpload).not.toHaveBeenCalled();
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { input } = renderAddPhoto({ busy: true });
    expect(input).toBeDisabled();
  });
});
