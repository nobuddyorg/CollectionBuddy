// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appRoot, mountAppRoot, removeAppRoot } from './appRoot.test-support';
import { useInertBackground } from './useInertBackground';

function Harness({ active }: { active: boolean }) {
  useInertBackground(active);
  return <div>dialog</div>;
}

beforeEach(mountAppRoot);

afterEach(removeAppRoot);

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

  // A confirm can open over an edit modal; the root stays inert until the last one closes.
  it('stays inert while a second, independent dialog is still open', () => {
    const first = render(<Harness active />);
    const second = render(<Harness active />);
    expect(appRoot().inert).toBe(true);

    first.unmount();
    expect(appRoot().inert).toBe(true);

    second.unmount();
    expect(appRoot().inert).toBeFalsy();
  });

  it('does nothing when there is no app root to find', () => {
    appRoot().remove();
    expect(() => render(<Harness active />)).not.toThrow();
  });
});
