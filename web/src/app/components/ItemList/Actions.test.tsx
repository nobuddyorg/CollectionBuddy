// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { Actions } from './Actions';

function renderActions(overrides: Partial<Parameters<typeof Actions>[0]> = {}) {
  const props = {
    onUpload: vi.fn(),
    busy: false,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const { container } = render(
    <I18nProvider>
      <Actions {...props} />
    </I18nProvider>,
  );
  return { props, container };
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
    expect(screen.getByText('Add image')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeVisible();
  });

  it('hands the chosen file to onUpload', async () => {
    const { props, container } = renderActions();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    expect(props.onUpload).toHaveBeenCalledWith(file);
  });

  it('does not call onUpload when the picker is dismissed', async () => {
    const { props, container } = renderActions();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, []);
    expect(props.onUpload).not.toHaveBeenCalled();
  });

  it('blocks the file picker while an upload is in flight', () => {
    const { container } = renderActions({ busy: true });
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });

  it('fires edit and delete handlers', async () => {
    const { props } = renderActions();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(props.onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
});
