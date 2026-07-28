// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Icon, IconType } from './index';

describe('Icon', () => {
  it.each(
    Object.values(IconType).filter(
      (value): value is IconType => typeof value === 'number',
    ),
  )('renders an svg for IconType %i', (icon) => {
    const { container } = render(<Icon icon={icon} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the rim text path for the Coin icon under a custom id', () => {
    const { container } = render(<Icon icon={IconType.Coin} rimId="my-rim" />);
    expect(container.querySelector('#my-rim')).toBeInTheDocument();
  });

  it('renders children inside the Coin svg', () => {
    const { getByText } = render(
      <Icon icon={IconType.Coin}>
        <text>face</text>
      </Icon>,
    );
    expect(getByText('face')).toBeInTheDocument();
  });

  it('renders nothing for an unknown icon value', () => {
    const { container } = render(<Icon icon={999 as IconType} />);
    expect(container.firstChild).toBeNull();
  });
});
