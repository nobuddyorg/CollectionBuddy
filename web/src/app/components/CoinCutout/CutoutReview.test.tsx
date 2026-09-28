// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { CutOutOptions } from '../../lib/coinCutout';

const cutOutCoin = vi.hoisted(() => vi.fn());
vi.mock('../../lib/coinCutout', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/coinCutout')>()),
  cutOutCoin,
}));

import { NoCoinFoundError } from '../../lib/coinCutout';
import CutoutReview from './CutoutReview';

const photo = new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' });
const cutoutBlob = new Blob(['png'], { type: 'image/png' });
const cutout = {
  blob: cutoutBlob,
  width: 5,
  height: 5,
  mode: 'ellipse',
  fillRatio: 0.98,
};

let options: CutOutOptions = {};
let settle: {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

function renderReview(onChoose = vi.fn()) {
  render(
    <I18nProvider>
      <CutoutReview file={photo} onChoose={onChoose} />
    </I18nProvider>,
  );
  return onChoose;
}

const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  localStorage.setItem('lang', 'en');
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
  cutOutCoin.mockReset().mockImplementation(
    (_file: File, given: CutOutOptions) =>
      new Promise((resolve, reject) => {
        options = given;
        settle = { resolve, reject };
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CutoutReview', () => {
  it('shows the original at once and works on the cut-out, focusing "Keep original"', () => {
    renderReview();

    expect(screen.getByTestId('cutout-original')).toHaveAttribute(
      'src',
      'blob:image/jpeg',
    );
    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'Cutting out the coin',
    );
    expect(screen.getByRole('button', { name: 'Use cut-out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep original' })).toHaveFocus();
    expect(cutOutCoin).toHaveBeenCalledWith(photo, expect.any(Object));
  });

  it('explains the one-time download and shows its progress', () => {
    renderReview();

    act(() =>
      options.onProgress!({ stage: 'download', loaded: 30, total: 90 }),
    );

    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'Downloading the cut-out model once (about 90 MB)',
    );
    const bar = screen.getByRole('progressbar', { name: 'Model download' });
    expect(bar).toHaveAttribute('value', '30');
    expect(bar).toHaveAttribute('max', '90');
  });

  it('leaves the bar indeterminate when the download names no size', () => {
    renderReview();

    act(() => options.onProgress!({ stage: 'download', loaded: 30, total: 0 }));

    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('value');
    expect(bar).not.toHaveAttribute('max');
  });

  it('never shows more than the whole download', () => {
    renderReview();

    act(() =>
      options.onProgress!({ stage: 'download', loaded: 120, total: 90 }),
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '90');
  });

  it('drops the bar once the model is running', () => {
    renderReview();
    act(() =>
      options.onProgress!({ stage: 'download', loaded: 90, total: 90 }),
    );

    act(() => options.onProgress!({ stage: 'analyze' }));

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'Cutting out the coin',
    );
  });

  it('shows the cut-out side by side with the original and uploads it on request', async () => {
    const onChoose = renderReview();

    await act(async () => settle.resolve(cutout));

    expect(screen.getByTestId('cutout-result')).toHaveAttribute(
      'src',
      'blob:image/png',
    );
    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'Compare the cut-out',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use cut-out' }));
    expect(onChoose).toHaveBeenCalledWith({
      kind: 'cut-out',
      blob: cutoutBlob,
    });
  });

  it('always lets the original be kept', async () => {
    const onChoose = renderReview();

    await userEvent.click(
      screen.getByRole('button', { name: 'Keep original' }),
    );

    expect(onChoose).toHaveBeenCalledWith({ kind: 'original' });
  });

  it('says so when the photo shows no coin, and offers the original', async () => {
    const onChoose = renderReview();

    await act(async () => settle.reject(new NoCoinFoundError()));

    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'No coin was found',
    );
    expect(screen.getByRole('button', { name: 'Use cut-out' })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep original' }),
    );
    expect(onChoose).toHaveBeenCalledWith({ kind: 'original' });
  });

  it('falls back to the original when the cut-out fails, and logs why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('HTTP 404');
    renderReview();

    await act(async () => settle.reject(error));

    expect(screen.getByTestId('cutout-status')).toHaveTextContent(
      'The background could not be removed',
    );
    expect(log).toHaveBeenCalledWith('Coin cut-out failed', error);
    expect(screen.getByRole('button', { name: 'Keep original' })).toBeEnabled();
  });

  it('stops the work and frees every image URL when it closes', async () => {
    const { unmount } = render(
      <I18nProvider>
        <CutoutReview file={photo} onChoose={vi.fn()} />
      </I18nProvider>,
    );
    await act(async () => settle.resolve(cutout));

    unmount();

    expect(options.signal!.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image/jpeg');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image/png');
  });

  it('starts over, stopping the old job, when handed another photo', () => {
    const { rerender } = render(
      <I18nProvider>
        <CutoutReview file={photo} onChoose={vi.fn()} />
      </I18nProvider>,
    );
    const first = options.signal!;
    const other = new File(['jpeg'], 'other.jpg', { type: 'image/jpeg' });

    rerender(
      <I18nProvider>
        <CutoutReview file={other} onChoose={vi.fn()} />
      </I18nProvider>,
    );

    expect(first.aborted).toBe(true);
    expect(cutOutCoin).toHaveBeenLastCalledWith(other, expect.any(Object));
  });

  it('shows nothing of a job it stopped, even if that job answers late', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(
      <I18nProvider>
        <CutoutReview file={photo} onChoose={vi.fn()} />
      </I18nProvider>,
    );
    unmount();

    await act(async () =>
      settle.reject(new DOMException('aborted', 'AbortError')),
    );

    expect(log).not.toHaveBeenCalled();
  });
});
