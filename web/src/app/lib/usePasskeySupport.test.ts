// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePasskeySupport } from './usePasskeySupport';

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  return createElement('span', null, String(usePasskeySupport()));
}

describe('usePasskeySupport', () => {
  it('is true where the browser has WebAuthn', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    const { result } = renderHook(() => usePasskeySupport());
    expect(result.current).toBe(true);
  });

  it('is false where it does not', () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    const { result } = renderHook(() => usePasskeySupport());
    expect(result.current).toBe(false);
  });

  it('is false while prerendering, whatever the build machine has', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    expect(renderToString(createElement(Probe))).toBe('<span>false</span>');
  });
});
