// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Coin from './index';
import { coinSizeCss } from './size';

describe('Coin', () => {
  it('sizes itself with the clamped css for the given size', () => {
    const { container } = render(<Coin text="Login" cta={null} size={360} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe(coinSizeCss(360));
    expect(wrapper.style.height).toBe(coinSizeCss(360));
  });

  it('defaults to a 420px size when none is given', () => {
    const { container } = render(<Coin text="Login" cta={null} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe(coinSizeCss(420));
  });

  it('renders the ring text and the cta together', () => {
    render(<Coin text="Sign in" cta={<button>Go</button>} />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('applies an extra className alongside the relative wrapper class', () => {
    const { container } = render(
      <Coin text="Login" cta={null} className="extra-class" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('relative');
    expect(wrapper.className).toContain('extra-class');
  });
});
