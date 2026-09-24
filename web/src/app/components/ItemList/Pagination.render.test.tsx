// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { Pagination } from './Pagination';

function renderPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const setPage = vi.fn();
  const view = render(
    <I18nProvider>
      <Pagination page={page} setPage={setPage} totalPages={totalPages} />
    </I18nProvider>,
  );
  return { setPage, rerender: view.rerender };
}

describe('Pagination', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  // The browser suite reaches this control by test id alone, so the ids are its contract.
  it('names both bars and every control the browser suite drives', () => {
    renderPagination({ page: 2, totalPages: 3 });

    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByTestId('pagination-compact')).toBeInTheDocument();
    // One pair of buttons, rendered into each bar.
    expect(screen.getAllByTestId('page-previous')).toHaveLength(2);
    expect(screen.getAllByTestId('page-next')).toHaveLength(2);
    expect(screen.getAllByTestId('page-number')).toHaveLength(3);
  });

  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <I18nProvider>
        <Pagination page={1} setPage={vi.fn()} totalPages={1} />
      </I18nProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for zero pages', () => {
    const { container } = render(
      <I18nProvider>
        <Pagination page={1} setPage={vi.fn()} totalPages={0} />
      </I18nProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables Previous on the first page', () => {
    renderPagination({ page: 1, totalPages: 3 });
    expect(
      screen.getAllByRole('button', { name: 'Previous' })[0],
    ).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: 'Next' })[0],
    ).not.toBeDisabled();
  });

  it('disables Next on the last page', () => {
    renderPagination({ page: 3, totalPages: 3 });
    expect(
      screen.getAllByRole('button', { name: 'Previous' })[0],
    ).not.toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Next' })[0]).toBeDisabled();
  });

  it('moves one page back or forward from the buttons', async () => {
    const user = userEvent.setup();
    const { setPage } = renderPagination({ page: 3, totalPages: 5 });

    await user.click(screen.getAllByRole('button', { name: 'Previous' })[0]);
    expect(setPage).toHaveBeenCalledWith(2);

    await user.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    expect(setPage).toHaveBeenCalledWith(4);
  });

  it('jumps straight to the page number that was clicked', async () => {
    const user = userEvent.setup();
    const { setPage } = renderPagination({ page: 1, totalPages: 10 });

    await user.click(screen.getAllByRole('button', { name: 'Page 5' })[0]);
    expect(setPage).toHaveBeenCalledWith(5);
  });

  it('marks only the current page as aria-current', () => {
    renderPagination({ page: 3, totalPages: 5 });

    expect(
      screen.getAllByRole('button', { name: 'Page 3' })[0],
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('button', { name: 'Page 1' })[0],
    ).not.toHaveAttribute('aria-current');
  });

  it('gives the current page button the highlighted style, and only that one', () => {
    renderPagination({ page: 3, totalPages: 5 });

    const current = screen.getAllByRole('button', { name: 'Page 3' })[0];
    const other = screen.getAllByRole('button', { name: 'Page 1' })[0];

    // The shared layout classes apply to every page button, current or not.
    expect(current.className).toContain('rounded-sm');
    expect(other.className).toContain('rounded-sm');

    expect(current.className).toContain('bg-primary');
    expect(other.className).not.toContain('bg-primary');
    expect(other.className).toContain('text-muted-foreground');
    expect(current.className).not.toContain('text-muted-foreground');
  });

  it('shows an ellipsis as non-interactive text, not a button', () => {
    renderPagination({ page: 1, totalPages: 10 });

    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThan(0);
    for (const ellipsis of ellipses) {
      expect(ellipsis.tagName).toBe('SPAN');
      expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
    }
  });

  // Two ellipses need distinct React keys; the "same key" warning never shows on the page itself.
  it('gives each ellipsis its own key rather than colliding on a shared one', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderPagination({ page: 5, totalPages: 10 });
    expect(screen.getAllByText('...')).toHaveLength(2);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("shows the mobile 'page of' text alongside the full page list", () => {
    renderPagination({ page: 2, totalPages: 5 });

    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('gives each pagination landmark the localized label', () => {
    renderPagination({ page: 1, totalPages: 3 });

    expect(
      screen.getAllByRole('navigation', { name: 'Pagination' }),
    ).toHaveLength(2);
  });

  it('recomputes the page list when the page or total changes, not just on mount', () => {
    const { rerender } = renderPagination({ page: 1, totalPages: 10 });
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Page 8' }),
    ).not.toBeInTheDocument();

    rerender(
      <I18nProvider>
        <Pagination page={10} setPage={vi.fn()} totalPages={10} />
      </I18nProvider>,
    );

    expect(screen.getByRole('button', { name: 'Page 8' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Page 5' }),
    ).not.toBeInTheDocument();
  });

  // Located by `title`, so the `aria-label` assertion checks that attribute's own value.
  it('sets Previous and Next aria-labels independently of their title', () => {
    renderPagination({ page: 2, totalPages: 3 });

    for (const button of screen.getAllByTitle('Previous')) {
      expect(button).toHaveAttribute('aria-label', 'Previous');
    }
    for (const button of screen.getAllByTitle('Next')) {
      expect(button).toHaveAttribute('aria-label', 'Next');
    }
  });

  // Located by `aria-label` this time, so a broken `title` can't hide behind it.
  it('sets Previous and Next titles independently of their aria-label', () => {
    renderPagination({ page: 2, totalPages: 3 });

    for (const button of screen.getAllByRole('button', {
      name: 'Previous',
    })) {
      expect(button).toHaveAttribute('title', 'Previous');
    }
    for (const button of screen.getAllByRole('button', { name: 'Next' })) {
      expect(button).toHaveAttribute('title', 'Next');
    }
  });
});
