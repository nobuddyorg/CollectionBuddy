// Built as DOM, not markup: every string is user-entered, so each is set via `textContent`, never parsed.
export const popupContent = (
  text: string,
  titles?: string[],
  countLabel?: string,
): HTMLDivElement => {
  const element = document.createElement('div');

  const heading = document.createElement('p');
  heading.className = 'font-display text-sm font-bold';
  heading.textContent = text;
  element.appendChild(heading);

  if (countLabel) {
    const count = document.createElement('p');
    count.className = 'font-label text-[0.6875rem] text-neutral-500';
    count.textContent = countLabel;
    element.appendChild(count);
  }

  if (titles?.length) {
    // Scrolls rather than truncates: the cap is on the popup's height, not on how many titles it names.
    const list = document.createElement('ul');
    list.className = 'mt-1.5 max-h-40 overflow-y-auto list-disc pl-4';
    for (const title of titles) {
      const item = document.createElement('li');
      item.textContent = title;
      list.appendChild(item);
    }
    element.appendChild(list);
  }

  return element;
};
