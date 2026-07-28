// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { CategoryInput } from './Input';

function renderInput(
  overrides: Partial<Parameters<typeof CategoryInput>[0]> = {},
) {
  const props = {
    name: '',
    setName: vi.fn(),
    createCategory: vi.fn(),
    setExpanded: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <CategoryInput {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('CategoryInput', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('reports what the user types', async () => {
    const props = renderInput();
    await userEvent.type(screen.getByRole('textbox'), 'S');
    expect(props.setName).toHaveBeenCalledWith('S');
  });

  it('creates the category on Enter', async () => {
    const props = renderInput({ name: 'Stamps' });
    await userEvent.type(screen.getByRole('textbox'), '{Enter}');
    expect(props.createCategory).toHaveBeenCalledOnce();
    expect(props.setExpanded).not.toHaveBeenCalled();
  });

  it('collapses the panel on Escape without creating anything', async () => {
    const props = renderInput({ name: 'Stamps' });
    await userEvent.type(screen.getByRole('textbox'), '{Escape}');
    expect(props.setExpanded).toHaveBeenCalledWith(false);
    expect(props.createCategory).not.toHaveBeenCalled();
  });

  it('is labelled for assistive tech via its placeholder text', () => {
    renderInput();
    expect(screen.getByPlaceholderText('New category')).toBeInTheDocument();
  });
});
