// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Icon, { IconType } from './index';

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

/**
 * Walks the line-only subset of path syntax the Frame icon uses (M/L/H/V and
 * their relative forms) and returns every point the pen visits.
 */
function penPoints(d: string): Array<[number, number]> {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  const points: Array<[number, number]> = [];
  let command = '';
  let x = 0;
  let y = 0;

  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      i += 1;
      continue;
    }

    const arg = (offset: number) => Number(tokens[i + offset]);
    switch (command) {
      case 'M':
      case 'L':
        [x, y] = [arg(0), arg(1)];
        i += 2;
        break;
      case 'm':
      case 'l':
        [x, y] = [x + arg(0), y + arg(1)];
        i += 2;
        break;
      case 'H':
        x = arg(0);
        i += 1;
        break;
      case 'h':
        x += arg(0);
        i += 1;
        break;
      case 'V':
        y = arg(0);
        i += 1;
        break;
      case 'v':
        y += arg(0);
        i += 1;
        break;
      default:
        throw new Error(`penPoints does not handle "${command}"`);
    }

    points.push([x, y]);
    // A moveto's trailing coordinate pairs are implicit linetos.
    if (command === 'M') command = 'L';
    if (command === 'm') command = 'l';
  }

  return points;
}

// A corner arrow whose head runs the wrong way leaves the 0..24 viewBox and
// renders with a leg missing, which is easy to miss in review and was how the
// bottom-left arrow shipped broken.
describe('Frame icon geometry', () => {
  const paths = () => {
    const { container } = render(<Icon icon={IconType.Frame} />);
    return [...container.querySelectorAll('path')].map(
      (p) => p.getAttribute('d') ?? '',
    );
  };

  it('draws one arrow per corner', () => {
    expect(paths()).toHaveLength(4);
  });

  it('keeps every point inside the viewBox', () => {
    for (const d of paths()) {
      for (const [x, y] of penPoints(d)) {
        expect(x, `x of "${d}"`).toBeGreaterThanOrEqual(0);
        expect(x, `x of "${d}"`).toBeLessThanOrEqual(24);
        expect(y, `y of "${d}"`).toBeGreaterThanOrEqual(0);
        expect(y, `y of "${d}"`).toBeLessThanOrEqual(24);
      }
    }
  });

  it('gives each arrow a head with two legs meeting at its corner', () => {
    // Every arrow is a diagonal plus a two-legged head; a dropped or
    // reversed leg changes the point count or collapses the legs together.
    for (const d of paths()) {
      const points = penPoints(d);
      expect(points, `points of "${d}"`).toHaveLength(6);
      const [, , corner, legA, , legB] = points;
      expect(corner[0], `head of "${d}"`).toBe(legA[0]);
      expect(corner[1], `head of "${d}"`).toBe(legB[1]);
      expect(legA, `legs of "${d}"`).not.toEqual(legB);
    }
  });
});
