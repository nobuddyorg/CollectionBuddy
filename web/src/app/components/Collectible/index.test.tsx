// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Collectible from './index';

describe('Collectible', () => {
  it('renders the emoji and sizes itself from the size prop', () => {
    const { container } = render(
      <Collectible delay={1.5} emoji="🪙" x="10%" y="20%" size={60} />,
    );
    expect(container).toHaveTextContent('🪙');
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('60px');
    expect(wrapper.style.height).toBe('60px');
    expect(wrapper.style.getPropertyValue('--delay')).toBe('1.5s');
    expect(wrapper.style.getPropertyValue('--x')).toBe('10%');
    expect(wrapper.style.getPropertyValue('--y')).toBe('20%');
  });

  it('defaults to a 44px size when none is given', () => {
    const { container } = render(
      <Collectible delay={0} emoji="🎲" x="0%" y="0%" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('44px');
  });

  it('is hidden from assistive tech and carries an extra className', () => {
    const { container } = render(
      <Collectible
        delay={0}
        emoji="🎲"
        x="0%"
        y="0%"
        className="extra-class"
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper.className).toContain('collectible-bob');
    expect(wrapper.className).toContain('extra-class');
  });
});
