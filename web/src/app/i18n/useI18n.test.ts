// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useI18n } from './useI18n';

describe('useI18n', () => {
  it('throws when used outside an I18nProvider', () => {
    expect(() => renderHook(() => useI18n())).toThrow(
      'useI18n must be used within an I18nProvider',
    );
  });
});
