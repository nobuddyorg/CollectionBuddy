// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/I18nProvider';
import { ConfirmProvider } from '../components/Confirm/ConfirmProvider';
import { useGuardedModalClose } from './useGuardedModalClose';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </I18nProvider>
  );
}

describe('useGuardedModalClose', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('closes without asking when there is nothing to lose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useGuardedModalClose(false, onClose, vi.fn()),
      { wrapper },
    );

    act(() => result.current());

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-accept')).not.toBeInTheDocument();
  });

  it('asks first when there is unsaved work, and closes once confirmed', async () => {
    const onClose = vi.fn();
    const onDiscard = vi.fn();
    const { result } = renderHook(
      () => useGuardedModalClose(true, onClose, onDiscard),
      { wrapper },
    );

    act(() => result.current());
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    // The caller's own dirty state is cleared before the close, not after.
    expect(onDiscard).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open when the question is declined', async () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useGuardedModalClose(true, onClose, vi.fn()),
      { wrapper },
    );

    act(() => result.current());
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a caller that has no dirty state of its own to clear', async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useGuardedModalClose(true, onClose), {
      wrapper,
    });

    act(() => result.current());
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(onClose).toHaveBeenCalled();
  });
});
