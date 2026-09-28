// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it } from 'vitest';

import { RIM_RADIUS } from './CoinIcon';
import { TextRing } from './TextRing';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// A bare <text> at the document root is created in the HTML namespace, not SVG.
function renderInSvg(element: React.ReactElement) {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  return render(element, { container: document.body.appendChild(svg) });
}

describe('TextRing', () => {
  it('renders the text along a textPath referencing the given rim id', () => {
    const { container } = renderInSvg(<TextRing rimId="rim-1" text="Hello" />);
    const textPath = container.querySelector('textPath');
    expect(textPath).toHaveAttribute('href', '#rim-1');
    expect(textPath).toHaveTextContent('Hello');
    expect(textPath?.namespaceURI).toBe(SVG_NAMESPACE);
  });

  it('fits the text to exactly one turn of the rim the coin draws', () => {
    const { container } = renderInSvg(<TextRing rimId="rim-1" text="Hello" />);
    const textPath = container.querySelector('textPath');
    expect(textPath).toHaveAttribute('startOffset', '0');
    expect(textPath).toHaveAttribute('lengthAdjust', 'spacing');
    expect(Number(textPath?.getAttribute('textLength'))).toBeCloseTo(
      2 * Math.PI * RIM_RADIUS,
      3,
    );
  });
});
