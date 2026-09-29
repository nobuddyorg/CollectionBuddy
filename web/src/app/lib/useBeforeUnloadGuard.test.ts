// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';
import { leavingIsHeld } from './useBeforeUnloadGuard.test-support';

describe('useBeforeUnloadGuard', () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it('lets the tab go when there is nothing to lose', () => {
    ({ unmount } = renderHook(() => useBeforeUnloadGuard(false)));

    expect(leavingIsHeld()).toBe(false);
  });

  it('holds the tab while there is unsaved work', () => {
    ({ unmount } = renderHook(() => useBeforeUnloadGuard(true)));

    expect(leavingIsHeld()).toBe(true);
  });

  it('lets the tab go again once the work is saved', () => {
    const hook = renderHook(
      ({ hasUnsavedWork }) => useBeforeUnloadGuard(hasUnsavedWork),
      { initialProps: { hasUnsavedWork: true } },
    );
    unmount = hook.unmount;

    hook.rerender({ hasUnsavedWork: false });

    expect(leavingIsHeld()).toBe(false);
  });

  it('stops holding the tab once unmounted', () => {
    const hook = renderHook(() => useBeforeUnloadGuard(true));

    hook.unmount();

    expect(leavingIsHeld()).toBe(false);
  });
});
