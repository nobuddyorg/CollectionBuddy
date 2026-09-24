import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ItemCard } from './ItemCard';
import type { ItemLite } from './types';

export const item: ItemLite = {
  id: '1',
  title: 'Item',
  description: null,
  place: null,
  place_lat: null,
  place_lng: null,
  tags: [],
};

export function renderCard(
  overrides: Partial<ItemLite> = {},
  props: Partial<Parameters<typeof ItemCard>[0]> = {},
) {
  const handlers = {
    onUpload: vi.fn(),
    onEditItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onDeleteImage: vi.fn(),
    onOpenModal: vi.fn(),
  };
  render(
    <I18nProvider>
      <ItemCard
        item={{ ...item, ...overrides }}
        images={[]}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return handlers;
}
