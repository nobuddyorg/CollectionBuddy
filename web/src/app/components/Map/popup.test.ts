// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { popupContent } from './popup';

// Pins the textContent-not-markup guarantee: swapping in `innerHTML` would reopen XSS via item titles.
describe('popupContent', () => {
  it('shows the heading text', () => {
    const element = popupContent('Cologne');
    expect(element.querySelector('p')?.textContent).toBe('Cologne');
  });

  it('styles the heading, the count line, and the title list distinctly', () => {
    const element = popupContent('Cologne', ['Seated Dime'], '1 entry');
    const paragraphs = element.querySelectorAll('p');
    expect(paragraphs[0].className).toBe('font-display text-sm font-bold');
    expect(paragraphs[1].className).toBe(
      'font-label text-[0.6875rem] text-neutral-500',
    );
    expect(element.querySelector('ul')?.className).toBe(
      'mt-1.5 max-h-40 overflow-y-auto list-disc pl-4',
    );
  });

  it('adds no count node when no count label is given', () => {
    const element = popupContent('Cologne', ['Seated Dime']);
    expect(element.querySelectorAll('p')).toHaveLength(1);
  });

  it('shows the count label as a second line when given one', () => {
    const element = popupContent('Cologne', ['A', 'B'], '2 entries');
    const paragraphs = element.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1].textContent).toBe('2 entries');
  });

  it('lists one <li> per title, in the order given', () => {
    const element = popupContent('Cologne', ['Seated Dime', 'Silver Eagle']);
    const items = Array.from(element.querySelectorAll('li'));
    expect(items.map((item) => item.textContent)).toEqual([
      'Seated Dime',
      'Silver Eagle',
    ]);
  });

  it('omits the list entirely when there are no titles', () => {
    expect(popupContent('Cologne').querySelector('ul')).toBeNull();
    expect(popupContent('Cologne', []).querySelector('ul')).toBeNull();
  });

  it('renders a hostile title as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const element = popupContent('Cologne', [hostile]);
    const item = element.querySelector('li');
    expect(item?.textContent).toBe(hostile);
    expect(item?.querySelector('img')).toBeNull();
    expect(element.querySelector('img')).toBeNull();
  });
});
