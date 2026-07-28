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
  const { t } = useI18n();
  const [tagInput, setTagInput] = useState('');

  const addTag = useCallback(() => {
    const v = tagInput.trim();
    if (!v || tags.includes(v)) return;
    setTags([...tags, v]);
    setTagInput('');
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
    <div className="rounded-sm bg-card text-card-foreground px-2 py-1.5 min-h-11 flex flex-wrap items-center gap-1.5 ring-1 ring-inset ring-border focus-within:ring-foreground">
      {tags.map((tag) => (
        <span key={tag} className="fade-up tag-chip flex items-center gap-1.5">
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
        {t('item_create.tags_count').replace('{count}', String(tags.length))}
      </span>
    </div>
  );
}
