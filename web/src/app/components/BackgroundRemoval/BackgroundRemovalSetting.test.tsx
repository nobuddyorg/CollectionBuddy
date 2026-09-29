// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { PreloadState } from './modelPreload';

const preload = vi.hoisted((): { state: PreloadState; preloadModel: Mock } => ({
  state: { status: 'idle' },
  preloadModel: vi.fn(),
}));
vi.mock('./modelPreload', () => ({
  preloadModel: preload.preloadModel,
  usePreloadState: () => preload.state,
}));

import { BackgroundRemovalSetting } from './BackgroundRemovalSetting';
import { BACKGROUND_REMOVAL_STORAGE_KEY } from './useBackgroundRemovalPreference';

function renderSetting() {
  return render(
    <I18nProvider>
      <BackgroundRemovalSetting />
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  preload.state = { status: 'idle' };
  preload.preloadModel.mockClear();
});

describe('BackgroundRemovalSetting', () => {
  it('is an unticked checkbox, described by what it does and costs', () => {
    renderSetting();

    const toggle = screen.getByRole('checkbox', { name: 'Remove backgrounds' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/about 90 MB once/);
    expect(screen.queryByTestId('model-preload')).toBeNull();
  });

  it('shows its explanation only after the info button is pressed', async () => {
    const user = userEvent.setup();
    renderSetting();
    const info = screen.getByRole('button', {
      name: 'About removing backgrounds',
    });

    expect(info).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('background-removal-hint')).not.toBeVisible();

    await user.click(info);
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('background-removal-hint')).toBeVisible();

    await user.click(info);
    expect(screen.getByTestId('background-removal-hint')).not.toBeVisible();
  });

  it('turns the opt-in on and off from the keyboard', async () => {
    const user = userEvent.setup();
    renderSetting();
    const toggle = screen.getByRole('checkbox', { name: 'Remove backgrounds' });

    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toBeChecked();
    expect(localStorage.getItem(BACKGROUND_REMOVAL_STORAGE_KEY)).toBe('on');

    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(BACKGROUND_REMOVAL_STORAGE_KEY)).toBeNull();
  });

  it('offers the model download only once the opt-in is on, and starts it only on a click', async () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    renderSetting();

    expect(preload.preloadModel).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Download model now (about 90 MB)' }),
    );
    expect(preload.preloadModel).toHaveBeenCalledOnce();
  });

  it('shows the download in percent', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    preload.state = { status: 'downloading', loaded: 45, total: 90 };

    renderSetting();

    expect(screen.getByTestId('model-status')).toHaveTextContent(
      'Downloading model: 50%',
    );
  });

  it('shows 0% while the size is still unknown, and never more than 100%', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    preload.state = { status: 'downloading', loaded: 45, total: 0 };
    const { rerender } = renderSetting();
    expect(screen.getByTestId('model-status')).toHaveTextContent('0%');

    preload.state = { status: 'downloading', loaded: 120, total: 90 };
    act(() =>
      rerender(
        <I18nProvider>
          <BackgroundRemovalSetting />
        </I18nProvider>,
      ),
    );
    expect(screen.getByTestId('model-status')).toHaveTextContent('100%');
  });

  it('says when the model is downloaded', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    preload.state = { status: 'ready' };

    renderSetting();

    expect(screen.getByRole('status')).toHaveTextContent('Model downloaded');
    expect(screen.queryByTestId('model-preload')).toBeNull();
  });

  it('reports a failed download and offers to try again', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
    preload.state = { status: 'failed' };

    renderSetting();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'could not be downloaded',
    );
    expect(screen.getByTestId('model-preload')).toBeEnabled();
  });
});
