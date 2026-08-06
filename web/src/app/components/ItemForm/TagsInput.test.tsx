// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { TagsInput } from './TagsInput';

// Tags are entered by keyboard and nothing else -- there is no add button --
// so every rule about what becomes a tag lives in one keydown handler. The
// end-to-end suite types a title and a description; it never gets near this.
function renderTags(tags: string[] = []) {
  const setTags = vi.fn();
  render(
    <I18nProvider>
      <TagsInput tags={tags} setTags={setTags} />
    </I18nProvider>,
  );
  return { setTags, field: screen.getByRole('textbox') };
}

describe('TagsInput', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('adds a tag on Enter', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, 'silver{Enter}');
    expect(setTags).toHaveBeenCalledWith(['silver']);
  });

  // A comma is how anyone who has used a tag field before expects to end one,
  // and it is also the separator the value is stored under.
  it('adds a tag on a comma', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, 'silver,');
    expect(setTags).toHaveBeenCalledWith(['silver']);
  });

  it('keeps the tags already there', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags(['gold']);

    await user.type(field, 'silver{Enter}');
    expect(setTags).toHaveBeenCalledWith(['gold', 'silver']);
  });

  it('trims what was typed', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, '  silver  {Enter}');
    expect(setTags).toHaveBeenCalledWith(['silver']);
  });

  it('refuses a tag that is only whitespace', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, '   {Enter}');
    expect(setTags).not.toHaveBeenCalled();
  });

  it('refuses an empty tag', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, '{Enter}');
    expect(setTags).not.toHaveBeenCalled();
  });

  // Silently, rather than with a complaint: adding a tag an entry already
  // carries is a no-op the user does not need to be told about.
  it('refuses a tag the entry already has', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags(['silver']);

    await user.type(field, 'silver{Enter}');
    expect(setTags).not.toHaveBeenCalled();
  });

  it('clears the field once a tag is taken', async () => {
    const user = userEvent.setup();
    const { field } = renderTags();

    await user.type(field, 'silver{Enter}');
    expect(field).toHaveValue('');
  });

  // Backspace on an empty field takes the last tag off, which is the
  // convention everywhere else this pattern appears.
  it('removes the last tag when Backspace is pressed on an empty field', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags(['gold', 'silver']);

    await user.type(field, '{Backspace}');
    expect(setTags).toHaveBeenCalledWith(['gold']);
  });

  // Only on an *empty* field, or backspacing a typo would delete a tag.
  it('leaves the tags alone when Backspace edits what is being typed', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags(['gold']);

    await user.type(field, 'sil{Backspace}');
    expect(setTags).not.toHaveBeenCalled();
  });

  it('has nothing to remove on an empty field with no tags', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags();

    await user.type(field, '{Backspace}');
    expect(setTags).not.toHaveBeenCalled();
  });

  it('removes a tag from its own button', async () => {
    const user = userEvent.setup();
    const { setTags } = renderTags(['gold', 'silver']);

    await user.click(screen.getByRole('button', { name: /remove.*gold/i }));
    expect(setTags).toHaveBeenCalledWith(['silver']);
  });

  it('announces how many tags there are', async () => {
    renderTags(['gold', 'silver']);
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });
});
