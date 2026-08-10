'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

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
  // Names the chip to flash when Enter repeats a tag already on the entry
  // -- the field clearing with nothing new appearing looked identical to a
  // tag being silently accepted, so the natural response was to press
  // Enter again. The flash points at the chip that already covers it.
  const [flashedTag, setFlashedTag] = useState<string | null>(null);

  const addTag = useCallback(() => {
    const v = tagInput.trim();
    if (!v) return;
    setTagInput('');
    if (tags.includes(v)) {
      setFlashedTag(v);
      return;
    }
    setTags([...tags, v]);
  }, [tagInput, tags, setTags]);

  const removeTag = useCallback(
    (v: string) => setTags(tags.filter((x) => x !== v)),
    [tags, setTags],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="rounded-sm bg-card text-card-foreground px-2 py-1.5 min-h-11 flex flex-wrap items-center gap-1.5 ring-1 ring-inset ring-control-border focus-within:ring-foreground">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`fade-up tag-chip flex items-center gap-1.5 ${tag === flashedTag ? 'tag-flash' : ''}`}
          onAnimationEnd={() => {
            if (tag === flashedTag) setFlashedTag(null);
          }}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="relative w-3.5 h-3.5 flex items-center justify-center rounded-full text-foreground/50 hover:text-destructive after:absolute after:-inset-2 after:content-['']"
            aria-label={t('item_create.remove_tag').replace('{tag}', tag)}
            title={t('item_create.remove_tag').replace('{tag}', tag)}
          >
            <Icon
              icon={IconType.Close}
              className="w-3 h-3"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={t('item_create.tags_placeholder')}
        placeholder={tags.length === 0 ? t('item_create.tags_placeholder') : ''}
        enterKeyHint="done"
        className="flex-1 min-w-[100px] bg-transparent py-1 text-sm"
      />
      <span role="status" className="sr-only">
        {tCount('item_create.tags_count', tags.length)}
      </span>
    </div>
  );
}
