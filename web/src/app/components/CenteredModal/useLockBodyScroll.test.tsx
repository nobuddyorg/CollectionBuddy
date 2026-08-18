// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLockBodyScroll } from './useLockBodyScroll';

function Harness({ active }: { active: boolean }) {
  useLockBodyScroll(active);
  return <div>dialog</div>;
}

afterEach(() => {
  document.body.style.overflow = '';
});

describe('useLockBodyScroll', () => {
  it('locks the page while it is active', () => {
    render(<Harness active />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('leaves the page alone while it is not', () => {
    render(<Harness active={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks when it goes away', () => {
    const { unmount } = render(<Harness active />);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks when it stops being active', () => {
    const { rerender } = render(<Harness active />);
    rerender(<Harness active={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  // Restores what was there rather than clearing: a second dialog opening
  // over the first must not unlock the page when only it closes.
  it('puts back the value it found rather than blanking it', () => {
    document.body.style.overflow = 'scroll';
    const { unmount } = render(<Harness active />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});
