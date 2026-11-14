// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { PageSizeChoice } from './PageSizeChoice';
import type { PageSize } from './paging';

function renderChoice(pageSize: PageSize, total: number) {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <PageSizeChoice pageSize={pageSize} total={total} onChange={onChange} />
    </I18nProvider>,
  );
  return onChange;
}

describe('PageSizeChoice', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('offers 6, 9, 12 and 24 as a named group, the current size pressed', () => {
    renderChoice(9, 40);

    const group = screen.getByRole('group', { name: 'Per page' });
    expect(group).toBeVisible();
    for (const size of ['6', '12', '24']) {
      expect(screen.getByRole('button', { name: size })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    expect(screen.getByRole('button', { name: '9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hands on the size picked', async () => {
    const onChange = renderChoice(9, 40);

    await userEvent.click(screen.getByRole('button', { name: '24' }));

    expect(onChange).toHaveBeenCalledWith(24);
  });

  // Six or fewer fit on the smallest page: no size changes anything.
  it.each([
    [6, false],
    [7, true],
  ])('with %d entries, is shown: %s', (total, shown) => {
    renderChoice(9, total);

    expect(screen.queryByRole('group') !== null).toBe(shown);
  });
});
