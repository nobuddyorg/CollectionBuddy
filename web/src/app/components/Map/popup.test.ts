// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { popupContent } from './popup';

// #423: this carries the whole visible output of #404 -- heading, count,
// scrolling title list -- and its textContent-not-markup XSS guarantee, but
// was unexported and asserted by nothing. A future edit swapping
// `textContent` for `innerHTML` would reintroduce XSS via item titles with
// every other gate green.
describe('popupContent', () => {
  it('shows the heading text', () => {
    const el = popupContent('Cologne');
    expect(el.querySelector('p')?.textContent).toBe('Cologne');
  });

  it('adds no count node when no count label is given', () => {
    const el = popupContent('Cologne', ['Seated Dime']);
    expect(el.querySelectorAll('p')).toHaveLength(1);
  });

  it('shows the count label as a second line when given one', () => {
    const el = popupContent('Cologne', ['A', 'B'], '2 entries');
    const paragraphs = el.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1].textContent).toBe('2 entries');
  });

  it('lists one <li> per title, in the order given', () => {
    const el = popupContent('Cologne', ['Seated Dime', 'Silver Eagle']);
    const items = Array.from(el.querySelectorAll('li'));
    expect(items.map((li) => li.textContent)).toEqual([
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
    const el = popupContent('Cologne', [hostile]);
    const li = el.querySelector('li');
    expect(li?.textContent).toBe(hostile);
    expect(li?.querySelector('img')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });
});
