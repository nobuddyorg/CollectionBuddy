'use client';

import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

function browserSupportsPasskeys(): boolean {
  return typeof window.PublicKeyCredential === 'function';
}

/** Whether this browser can run a passkey prompt; false on the build machine, which prerenders without `window`. */
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    browserSupportsPasskeys,
    () => false,
  );
}
