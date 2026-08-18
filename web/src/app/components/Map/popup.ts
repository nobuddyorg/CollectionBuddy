/**
 * A pin's popup. Built as DOM, not markup, since Leaflet binds a node not a
 * React tree -- every string here is user-entered, so each is set via
 * `textContent`, never parsed as HTML.
 *
 * Deliberately not themed: a popup floats over map tiles, which are the
 * same paper colour in either theme, so it keeps Leaflet's own light
 * styling rather than turning charcoal over a light map.
 */
export const popupContent = (
  text: string,
  titles?: string[],
  countLabel?: string,
): HTMLDivElement => {
  const el = document.createElement('div');

  const heading = document.createElement('p');
  heading.className = 'font-display text-sm font-bold';
  heading.textContent = text;
  el.appendChild(heading);

  if (countLabel) {
    const count = document.createElement('p');
    count.className = 'font-label text-[0.6875rem] text-neutral-500';
    count.textContent = countLabel;
    el.appendChild(count);
  }

  if (titles?.length) {
    // Scrolls rather than truncates: the cap is on the popup's height, not
    // on how many titles it can name.
    const list = document.createElement('ul');
    list.className = 'mt-1.5 max-h-40 overflow-y-auto list-disc pl-4';
    for (const title of titles) {
      const item = document.createElement('li');
      item.textContent = title;
      list.appendChild(item);
    }
    el.appendChild(list);
  }

  return el;
};
