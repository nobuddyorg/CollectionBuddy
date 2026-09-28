// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { PreloadState } from './coinModelPreload';

const preload = vi.hoisted((): { state: PreloadState; preloadModel: Mock } => ({
  state: { status: 'idle' },
  preloadModel: vi.fn(),
}));
vi.mock('./coinModelPreload', () => ({
  preloadModel: preload.preloadModel,
  usePreloadState: () => preload.state,
}));

import { CoinCutoutSetting } from './CoinCutoutSetting';
import { COIN_CUTOUT_STORAGE_KEY } from './useCoinCutoutPreference';

function renderSetting() {
  return render(
    <I18nProvider>
      <CoinCutoutSetting />
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  preload.state = { status: 'idle' };
  preload.preloadModel.mockClear();
});

describe('CoinCutoutSetting', () => {
  it('is an unticked checkbox, described by what it does and costs', () => {
    renderSetting();

    const toggle = screen.getByRole('checkbox', { name: 'Cut out coins' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/about 90 MB once/);
    expect(screen.queryByTestId('coin-model-preload')).toBeNull();
  });

  it('turns the opt-in on and off from the keyboard', async () => {
    const user = userEvent.setup();
    renderSetting();
    const toggle = screen.getByRole('checkbox', { name: 'Cut out coins' });

    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toBeChecked();
    expect(localStorage.getItem(COIN_CUTOUT_STORAGE_KEY)).toBe('on');

    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(COIN_CUTOUT_STORAGE_KEY)).toBeNull();
  });

  it('offers the model download only once the opt-in is on, and starts it only on a click', async () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
    renderSetting();

    expect(preload.preloadModel).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Download model now (about 90 MB)' }),
    );
    expect(preload.preloadModel).toHaveBeenCalledOnce();
  });

  it('shows the download in percent', () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
    preload.state = { status: 'downloading', loaded: 45, total: 90 };

    renderSetting();

    expect(screen.getByTestId('coin-model-status')).toHaveTextContent(
      'Downloading model: 50%',
    );
  });

  it('shows 0% while the size is still unknown, and never more than 100%', () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
    preload.state = { status: 'downloading', loaded: 45, total: 0 };
    const { rerender } = renderSetting();
    expect(screen.getByTestId('coin-model-status')).toHaveTextContent('0%');

    preload.state = { status: 'downloading', loaded: 120, total: 90 };
    act(() =>
      rerender(
        <I18nProvider>
          <CoinCutoutSetting />
        </I18nProvider>,
      ),
    );
    expect(screen.getByTestId('coin-model-status')).toHaveTextContent('100%');
  });

  it('says when the model is downloaded', () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
    preload.state = { status: 'ready' };

    renderSetting();

    expect(screen.getByRole('status')).toHaveTextContent('Model downloaded');
    expect(screen.queryByTestId('coin-model-preload')).toBeNull();
  });

  it('reports a failed download and offers to try again', () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
    preload.state = { status: 'failed' };

    renderSetting();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'could not be downloaded',
    );
    expect(screen.getByTestId('coin-model-preload')).toBeEnabled();
  });
});
