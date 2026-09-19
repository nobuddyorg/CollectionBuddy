// @vitest-environment jsdom
import { useState } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider, useConfirm } from './ConfirmProvider';

describe('useConfirm', () => {
  it('throws when used outside a ConfirmProvider', () => {
    expect(() => renderHook(() => useConfirm())).toThrow(
      'useConfirm must be used within a ConfirmProvider',
    );
  });
});

function Trigger() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState('pending');
  return (
    <>
      <button
        onClick={() => {
          void confirm('Sure?').then((result) => setAnswer(String(result)));
        }}
      >
        ask
      </button>
      <p>{answer}</p>
    </>
  );
}

describe('ConfirmProvider', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  function renderTrigger() {
    render(
      <I18nProvider>
        <ConfirmProvider>
          <Trigger />
        </ConfirmProvider>
      </I18nProvider>,
    );
  }

  it('treats dismissal via the dialog close button the same as Cancel', async () => {
    const user = userEvent.setup();
    renderTrigger();

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('Sure?');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText('false')).toBeInTheDocument();
  });

  it('treats dismissal via Escape the same as Cancel', async () => {
    const user = userEvent.setup();
    renderTrigger();

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('Sure?');
    await user.keyboard('{Escape}');

    expect(await screen.findByText('false')).toBeInTheDocument();
  });
});
