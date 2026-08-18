// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { TagsInput } from './TagsInput';

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

  // No complaint: a duplicate tag is a silent no-op.
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

  it('clears the field on a duplicate too, not just a successful add', async () => {
    const user = userEvent.setup();
    const { field } = renderTags(['silver']);

    await user.type(field, 'silver{Enter}');
    expect(field).toHaveValue('');
  });

  it('flashes the chip that already covers a duplicate', async () => {
    const user = userEvent.setup();
    const { field } = renderTags(['silver']);

    await user.type(field, 'silver{Enter}');
    expect(screen.getByText('silver').closest('span')).toHaveClass('tag-flash');
  });

  it('removes the last tag when Backspace is pressed on an empty field', async () => {
    const user = userEvent.setup();
    const { setTags, field } = renderTags(['gold', 'silver']);

    await user.type(field, '{Backspace}');
    expect(setTags).toHaveBeenCalledWith(['gold']);
  });

  // Only on an empty field, or backspacing a typo would delete a tag.
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
