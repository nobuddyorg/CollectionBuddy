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
});
