// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ItemCard } from './ItemCard';
import type { ItemLite } from './types';

const item: ItemLite = {
  id: '1',
  title: 'Item',
  description: null,
  place: null,
  tags: [],
};

function renderCard(busy: boolean) {
  return render(
    <I18nProvider>
      <ItemCard
        item={item}
        imgs={[]}
        busy={busy}
        deletingPath={new Set()}
        onUpload={vi.fn()}
        onEditItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onDeleteImage={vi.fn()}
        onOpenModal={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('ItemCard', () => {
  beforeEach(() => {
    // I18nProvider falls back to navigator.language ('en-US' in jsdom) on
    // mount unless a stored preference says otherwise; pin it so the
    // aria-labels below don't depend on that incidental default.
    window.localStorage.setItem('lang', 'en');
  });

  it('opens the action row on click and closes it once a busy upload settles', () => {
    const { rerender } = renderCard(true);
    fireEvent.click(screen.getByLabelText('More actions'));

    const closeButton = screen.getByLabelText('Close');
    expect(closeButton.parentElement).toHaveClass('opacity-100');

    rerender(
      <I18nProvider>
        <ItemCard
          item={item}
          imgs={[]}
          busy={false}
          deletingPath={new Set()}
          onUpload={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onDeleteImage={vi.fn()}
          onOpenModal={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByLabelText('Close').parentElement).toHaveClass(
      'opacity-0',
    );
  });
});
