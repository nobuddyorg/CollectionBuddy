/**
 * A pin's popup: the place, and the entries catalogued there (#404).
 *
 * Built as DOM rather than markup because Leaflet binds a node, not a React
 * tree -- and every string in here is user-entered, so each one is set with
 * `textContent`. A title is a value this app stored faithfully; it must
 * never be a value this app parses as HTML.
 *
 * Deliberately not themed. A popup floats over map tiles, which are the
 * same paper colour whichever theme the app is in, so it keeps Leaflet's
 * own light styling in both rather than turning charcoal over a light map.
 *
 * Kept in its own module, apart from `./index`, so it can be unit-tested
 * without importing Leaflet's CSS and marker images along with it (#423).
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
    // Scrolls rather than truncates: the ask was the titles of *all* the
    // collectibles at a place, and a pin standing for thirty of them should
    // still be able to name the thirtieth. The cap is on the popup's
    // height, not on the collection.
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
