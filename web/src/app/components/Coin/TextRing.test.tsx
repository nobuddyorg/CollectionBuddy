// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TextRing } from './TextRing';

describe('TextRing', () => {
  it('renders the text along a textPath referencing the given rim id', () => {
    const { container } = render(
      <TextRing
        rimId="rim-1"
        text="Hello"
        fontFamily="serif"
        fontSize={12}
        letterSpacing={2}
        opacity={0.5}
      />,
    );
    const textPath = container.querySelector('textPath');
    expect(textPath).toHaveAttribute('href', '#rim-1');
    expect(textPath).toHaveTextContent('Hello');
    expect(container.querySelector('text')).toHaveAttribute('opacity', '0.5');
  });

  it('fits the text to exactly one turn of the rim', () => {
    const { container } = render(
      <TextRing
        rimId="rim-1"
        text="Hello"
        fontFamily="serif"
        fontSize={12}
        letterSpacing={2}
        opacity={1}
        radius={100}
      />,
    );
    const textPath = container.querySelector('textPath');
    expect(textPath).toHaveAttribute('startOffset', '0');
    expect(textPath).toHaveAttribute('lengthAdjust', 'spacing');
    expect(Number(textPath?.getAttribute('textLength'))).toBeCloseTo(
      2 * Math.PI * 100,
      3,
    );
  });

  it('defaults to the rim radius the coin actually draws', () => {
    const { container } = render(
      <TextRing
        rimId="rim-1"
        text="Hello"
        fontFamily="serif"
        fontSize={12}
        letterSpacing={2}
        opacity={1}
      />,
    );
    expect(
      Number(container.querySelector('textPath')?.getAttribute('textLength')),
    ).toBeCloseTo(2 * Math.PI * 160, 3);
  });
});
