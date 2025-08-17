'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';

export function TagsInput({
  tags,
  setTags,
}: {
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
    <div className="rounded-xl border bg-card/60 dark:bg-card/70 px-2 py-1 flex flex-wrap items-center gap-1 focus-within:border-primary dark:focus-within:border-primary">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full px-2 py-0.5 text-sm"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="w-4 h-4 flex items-center justify-center rounded-xl bg-red-500 text-white shadow-sm hover:bg-red-600"
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
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={tags.length === 0 ? t('item_create.tags_placeholder') : ''}
        className="flex-1 min-w-[100px] bg-transparent outline-none py-1 text-sm"
      />
    </div>
  );
}
