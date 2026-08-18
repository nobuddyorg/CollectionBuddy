// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { getFocusable } from './getFocusable';

// The focus trap is built on this list; a hand-written selector can silently
// lose an entry in a refactor, letting Tab escape the dialog.
function container(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

const namesIn = (element: HTMLElement) =>
  getFocusable(element).map((node) => node.getAttribute('data-name'));

describe('getFocusable', () => {
  it('has nothing to offer for no container at all', () => {
    expect(getFocusable(null)).toEqual([]);
  });

  it('finds nothing in a container with nothing focusable in it', () => {
    expect(getFocusable(container('<p>just words</p>'))).toEqual([]);
  });

  // One case per selector: each is its own clause, and a lost clause is
  // invisible until somebody tabs onto that element.
  it.each([
    ['a link with a target', '<a href="#x" data-name="a">link</a>'],
    ['a button', '<button data-name="a">press</button>'],
    ['a text field', '<input data-name="a">'],
    ['a text area', '<textarea data-name="a"></textarea>'],
    ['a select', '<select data-name="a"></select>'],
    ['anything given a tab stop', '<div tabindex="0" data-name="a"></div>'],
  ])('finds %s', (_what, html) => {
    expect(namesIn(container(html))).toEqual(['a']);
  });

  it('skips a link that goes nowhere', () => {
    expect(getFocusable(container('<a>no target</a>'))).toEqual([]);
  });

  it.each([
    ['button', '<button disabled data-name="a">press</button>'],
    ['input', '<input disabled data-name="a">'],
    ['textarea', '<textarea disabled data-name="a"></textarea>'],
    ['select', '<select disabled data-name="a"></select>'],
  ])('skips a disabled %s', (_what, html) => {
    expect(getFocusable(container(html))).toEqual([]);
  });

  // -1 means "focusable by script, not by Tab", so it must not appear here.
  it('skips an element taken out of the tab order', () => {
    expect(getFocusable(container('<div tabindex="-1"></div>'))).toEqual([]);
  });

  // Document order is the order Tab moves in; the first and last of this
  // list are what the trap wraps between.
  it('returns them in the order they appear', () => {
    const element = container(`
      <button data-name="first">one</button>
      <input data-name="second">
      <a href="#x" data-name="third">three</a>
    `);
    expect(namesIn(element)).toEqual(['first', 'second', 'third']);
  });

  it('reaches elements nested inside the container', () => {
    const element = container(
      '<div><section><button data-name="deep">press</button></section></div>',
    );
    expect(namesIn(element)).toEqual(['deep']);
  });

  // A file input hidden via Tailwind's `.hidden` is a real shape in this
  // app; focusing one silently fails, leaving focus outside the dialog.
  it('skips a display:none element', () => {
    const element = container(
      '<button style="display:none" data-name="a">press</button><button data-name="b">press</button>',
    );
    expect(namesIn(element)).toEqual(['b']);
  });

  it('skips a visibility:hidden element', () => {
    const element = container(
      '<button style="visibility:hidden" data-name="a">press</button><button data-name="b">press</button>',
    );
    expect(namesIn(element)).toEqual(['b']);
  });

  it('skips an element with the hidden attribute', () => {
    const element = container(
      '<button hidden data-name="a">press</button><button data-name="b">press</button>',
    );
    expect(namesIn(element)).toEqual(['b']);
  });

  it('skips a hidden input even though it has no disabled attribute', () => {
    const element = container(
      '<input type="hidden" data-name="a"><button data-name="b">press</button>',
    );
    expect(namesIn(element)).toEqual(['b']);
  });
});
