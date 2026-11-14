// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePreviewFrame } from './PhotoPreview';

beforeEach(() => {
  localStorage.removeItem('photoBackdrop');
});

describe('usePreviewFrame', () => {
  it('shows a see-through background as a checkerboard while photos follow the theme', () => {
    const { result } = renderHook(() => usePreviewFrame());

    expect(result.current).toContain('conic-gradient');
  });

  it.each([
    ['black', 'bg-black'],
    ['white', 'bg-white'],
  ])(
    'previews it on %s once that is the catalogue’s backdrop',
    (backdrop, backdropClass) => {
      localStorage.setItem('photoBackdrop', backdrop);

      const { result } = renderHook(() => usePreviewFrame());

      expect(result.current.split(' ')).toContain(backdropClass);
      expect(result.current).not.toContain('conic-gradient');
    },
  );
});
