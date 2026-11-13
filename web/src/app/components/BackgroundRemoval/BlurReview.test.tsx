// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { BlurReview } from './BlurReview';

const photo = new File(['jpeg'], 'coin.jpg', { type: 'image/jpeg' });
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:photo');
const revokeObjectURL = vi.fn();

function renderReview(language = 'en') {
  localStorage.setItem('lang', language);
  const onChoose = vi.fn();
  const view = render(
    <I18nProvider>
      <BlurReview file={photo} onChoose={onChoose} />
    </I18nProvider>,
  );
  return { onChoose, ...view };
}

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BlurReview', () => {
  it('shows the photo it warns about, before anything uploads', () => {
    renderReview();

    expect(createObjectURL).toHaveBeenCalledWith(photo);
    expect(
      screen.getByRole('img', { name: 'The photo that looks blurry' }),
    ).toHaveAttribute('src', 'blob:photo');
    expect(screen.getByTestId('blur-warning')).toHaveTextContent(
      'This photo looks blurry. Keep it anyway, or skip it and take or choose another.',
    );
  });

  it('keeps the photo when told to', async () => {
    const { onChoose } = renderReview();

    await userEvent.click(screen.getByRole('button', { name: 'Keep anyway' }));

    expect(onChoose).toHaveBeenCalledExactlyOnceWith({ kind: 'original' });
  });

  it('skips the photo when told to', async () => {
    const { onChoose } = renderReview();

    await userEvent.click(
      screen.getByRole('button', { name: 'Skip this photo' }),
    );

    expect(onChoose).toHaveBeenCalledExactlyOnceWith({ kind: 'skip' });
  });

  // What the person picked stays the default, as it would have with no warning at all.
  it('focuses Keep anyway, so Enter keeps the photo', () => {
    renderReview();

    expect(screen.getByRole('button', { name: 'Keep anyway' })).toHaveFocus();
  });

  it('speaks German by default', () => {
    renderReview('de');

    expect(
      screen.getByRole('button', { name: 'Trotzdem behalten' }),
    ).toBeInTheDocument();
  });

  it('frees the photo URL when it closes', () => {
    const { unmount } = renderReview();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});
