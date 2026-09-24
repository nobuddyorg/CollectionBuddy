'use client';

import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../../lib/textLimits';

// Matches .tag-flash's animation-duration in globals.css; a timer, not onAnimationEnd, so it always clears.
const FLASH_DURATION_MS = 350;

export function TagsInput({
  id,
  tags,
  setTags,
}: {
  id?: string;
  tags: string[];
  setTags: (tags: string[]) => void;
}) {
  const { t, tCount } = useI18n();
  const [tagInput, setTagInput] = useState('');
  // Flashes the chip already covering a repeated tag, or the field clearing looks like nothing happened.
  const [flashedTag, setFlashedTag] = useState<string | null>(null);

  useEffect(() => {
    if (!flashedTag) return;
    const timer = setTimeout(() => setFlashedTag(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flashedTag]);

  const addTag = useCallback(() => {
    const value = tagInput.trim();
    if (!value) return;
    setTagInput('');
    if (tags.includes(value)) {
      setFlashedTag(value);
      return;
    }
    setTags([...tags, value]);
  }, [tagInput, tags, setTags]);

  const removeTag = useCallback(
    (value: string) => setTags(tags.filter((tag) => tag !== value)),
    [tags, setTags],
  );

  // Read-only rather than disabled at the limit, so Backspace still removes the last tag.
  const atLimit = tags.length >= MAX_TAGS;
  const emptyPlaceholder =
    tags.length === 0 ? t('item_create.tags_placeholder') : '';

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    } else if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="rounded-sm bg-card text-card-foreground px-2 py-1.5 min-h-11 flex flex-wrap items-center gap-1.5 ring-1 ring-inset ring-control-border focus-within:ring-foreground">
      {tags.map((tag) => (
        <span
          key={tag}
          data-testid="tag-chip"
          className={`fade-up tag-chip flex items-center gap-1.5 ${tag === flashedTag ? 'tag-flash' : ''}`}
        >
          {tag}
          <button
            type="button"
            data-testid="remove-tag"
            onClick={() => removeTag(tag)}
            className="relative w-3.5 h-3.5 flex items-center justify-center rounded-full text-foreground/50 hover:text-destructive after:absolute after:-inset-2 after:content-['']"
            aria-label={t('item_create.remove_tag').replace('{tag}', tag)}
            title={t('item_create.remove_tag').replace('{tag}', tag)}
          >
            <Icon
              icon={IconType.Close}
              className="w-3 h-3"
              // Trailing override: Close's own default is a thinner 2.
              strokeWidth="3"
            />
          </button>
        </span>
      ))}
      <input
        id={id}
        data-testid="item-tags"
        value={tagInput}
        maxLength={MAX_TAG_LENGTH}
        readOnly={atLimit}
        onChange={(event) => setTagInput(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label={t('item_create.tags_placeholder')}
        placeholder={atLimit ? t('item_create.tags_limit') : emptyPlaceholder}
        enterKeyHint="done"
        className="flex-1 min-w-[100px] bg-transparent py-1 text-sm"
      />
      <span role="status" className="sr-only">
        {tCount('item_create.tags_count', tags.length)}
      </span>
    </div>
  );
}
