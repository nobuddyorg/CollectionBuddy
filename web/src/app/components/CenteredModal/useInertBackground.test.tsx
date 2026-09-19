// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInertBackground } from './useInertBackground';

function Harness({ active }: { active: boolean }) {
  useInertBackground(active);
  return <div>dialog</div>;
}

function appRoot() {
  return document.getElementById('app-root') as HTMLElement;
}

beforeEach(() => {
  const root = document.createElement('div');
  root.id = 'app-root';
  document.body.appendChild(root);
});

afterEach(() => {
  appRoot()?.remove();
});

describe('useInertBackground', () => {
  it('marks the app root inert while active', () => {
    render(<Harness active />);
    expect(appRoot().inert).toBe(true);
  });

  it('leaves the app root alone while inactive', () => {
    render(<Harness active={false} />);
    expect(appRoot().inert).toBeFalsy();
  });

  it('clears inert once it unmounts', () => {
    const { unmount } = render(<Harness active />);
    unmount();
    expect(appRoot().inert).toBeFalsy();
  });

  it('clears inert as soon as it stops being active', () => {
    const { rerender } = render(<Harness active />);
    rerender(<Harness active={false} />);
    expect(appRoot().inert).toBeFalsy();
  });

  // A confirm dialog can open on top of an already-open edit modal. The
  // root must stay inert until the last of them closes, not the first.
  it('stays inert while a second, independent dialog is still open', () => {
    const first = render(<Harness active />);
    const second = render(<Harness active />);
    expect(appRoot().inert).toBe(true);

    first.unmount();
    expect(appRoot().inert).toBe(true);

    second.unmount();
    expect(appRoot().inert).toBeFalsy();
  });

  // Only the dialog that actually flips the root inert should ever touch
  // the property -- a second, nested dialog finding it already inert must
  // not write to it again.
  it('only sets inert once, on the first of two nested dialogs', () => {
    const setInert = vi.fn();
    Object.defineProperty(appRoot(), 'inert', {
      configurable: true,
      get: () => true,
      set: setInert,
    });

    const first = render(<Harness active />);
    render(<Harness active />);

    expect(setInert).toHaveBeenCalledTimes(1);
    first.unmount();
  });

  it('does nothing when there is no app root to find', () => {
    appRoot().remove();
    expect(() => render(<Harness active />)).not.toThrow();
  });
});
