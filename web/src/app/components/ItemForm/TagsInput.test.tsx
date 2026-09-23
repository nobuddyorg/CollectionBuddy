// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
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

  it('drops the flash once its animation has had time to finish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup();
      const { field } = renderTags(['silver']);

      await user.type(field, 'silver{Enter}');
      const chip = screen.getByText('silver').closest('span')!;
      expect(chip).toHaveClass('tag-flash');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(chip).not.toHaveClass('tag-flash');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the flash timer for a second duplicate before the first has cleared', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup();
      const { field } = renderTags(['silver', 'gold']);

      await user.type(field, 'silver{Enter}');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await user.type(field, 'gold{Enter}');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // 400ms have passed since "silver" flashed, more than enough for its
      // own timer to have fired -- but "gold" flashing in between must not
      // have left it hanging: covered by the flash's normal 350ms clearing.
      const silverChip = screen.getByText('silver').closest('span')!;
      const goldChip = screen.getByText('gold').closest('span')!;
      expect(silverChip).not.toHaveClass('tag-flash');
      expect(goldChip).toHaveClass('tag-flash');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(goldChip).not.toHaveClass('tag-flash');
    } finally {
      vi.useRealTimers();
    }
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

  // The database refuses a 51st tag (0016_bound_row_volume.sql); the field stops taking one first.
  it('takes no more typing at 50 tags, and says why', async () => {
    const user = userEvent.setup();
    const fifty = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    const { setTags, field } = renderTags(fifty);

    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveAttribute(
      'placeholder',
      '50 tags at most – remove one to add another',
    );
    await user.type(field, 'more{Enter}');
    expect(setTags).not.toHaveBeenCalled();
  });

  it('still removes the last tag with Backspace at the limit', async () => {
    const user = userEvent.setup();
    const fifty = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    const { setTags, field } = renderTags(fifty);

    await user.type(field, '{Backspace}');
    expect(setTags).toHaveBeenCalledWith(fifty.slice(0, 49));
  });

  it('keeps taking tags one below the limit', async () => {
    const user = userEvent.setup();
    const fortyNine = Array.from({ length: 49 }, (_, i) => `tag${i}`);
    const { setTags, field } = renderTags(fortyNine);

    expect(field).not.toHaveAttribute('readonly');
    await user.type(field, 'last{Enter}');
    expect(setTags).toHaveBeenCalledWith([...fortyNine, 'last']);
  });

  it('caps a single tag at 100 characters', () => {
    const { field } = renderTags();
    expect(field).toHaveAttribute('maxlength', '100');
  });

  it('announces how many tags there are', async () => {
    renderTags(['gold', 'silver']);
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });
});
