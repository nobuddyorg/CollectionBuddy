// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readStoredValue,
  removeStoredValue,
  writeStoredValue,
} from './browserStorage';
import { refuseStorage } from './browserStorage.test-support';

function refuseStorageAccess() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
}

describe('browser storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when storage works', () => {
    it('reads back what was written under the same key', () => {
      writeStoredValue('key', 'value');

      expect(window.localStorage.getItem('key')).toBe('value');
      expect(readStoredValue('key')).toBe('value');
    });

    it('reads nothing for a key never written', () => {
      expect(readStoredValue('key')).toBeNull();
    });

    it('removes only the key it names', () => {
      window.localStorage.setItem('key', 'value');
      window.localStorage.setItem('other', 'kept');

      removeStoredValue('key');

      expect(window.localStorage.getItem('key')).toBeNull();
      expect(window.localStorage.getItem('other')).toBe('kept');
    });
  });

  describe('when a storage call throws', () => {
    it('reads nothing', () => {
      window.localStorage.setItem('key', 'value');
      refuseStorage('getItem');

      expect(readStoredValue('key')).toBeNull();
    });

    it('writes nothing, without an error', () => {
      refuseStorage('setItem');

      expect(() => writeStoredValue('key', 'value')).not.toThrow();
    });

    it('removes nothing, without an error', () => {
      refuseStorage('removeItem');

      expect(() => removeStoredValue('key')).not.toThrow();
    });
  });

  describe('when reaching storage at all throws', () => {
    it('reads nothing', () => {
      window.localStorage.setItem('key', 'value');
      refuseStorageAccess();

      expect(readStoredValue('key')).toBeNull();
    });

    it('writes nothing, without an error', () => {
      refuseStorageAccess();

      expect(() => writeStoredValue('key', 'value')).not.toThrow();
    });

    it('removes nothing, without an error', () => {
      refuseStorageAccess();

      expect(() => removeStoredValue('key')).not.toThrow();
    });
  });
});
