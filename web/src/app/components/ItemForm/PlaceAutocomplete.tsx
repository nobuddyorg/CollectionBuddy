'use client';
import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { isQueryLongEnough, usePhotonSearch } from './usePhoton';
import type { Coordinates } from '../../lib/coordinates';
import { fieldClasses } from '../ui/fieldClasses';
import { MAX_PLACE_LENGTH } from '../../lib/textLimits';

const MENU_MESSAGE_CLASSES = 'px-3 py-2 text-sm text-muted-foreground';

// `onChange` reports null coords for hand-typed edits, so stale coordinates never outlive their name.
export function PlaceAutocomplete({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string, coords: Coordinates | null) => void;
}) {
  const { t, language } = useI18n();
  const {
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    error,
    searched,
    activeIndex,
    dropdownRef,
    inputRef,
    menuRef,
    choose,
    onKeyDown,
    formatDisplay,
  } = usePhotonSearch({
    language,
    onPick: (choice) => onChange(choice.label, choice.coords),
  });
  const listId = useId();

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  const showMenu =
    focus && (loading || results.length > 0 || error || searched);

  // Positioned absolute inside the anchor, so it scrolls with the input; only below/above is recomputed.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  useEffect(() => {
    if (!showMenu) return;
    const compute = () => {
      const inputRect = inputRef.current!.getBoundingClientRect();
      const menuHeight = menuRef.current!.offsetHeight;
      const spaceBelow = window.innerHeight - inputRect.bottom;
      setPlacement(
        spaceBelow < menuHeight && inputRect.top > spaceBelow
          ? 'above'
          : 'below',
      );
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [showMenu, results.length, loading, error, inputRef, menuRef]);

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        id={id}
        data-testid="item-place"
        ref={inputRef}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showMenu && activeIndex >= 0
            ? `${listId}-opt-${activeIndex}`
            : undefined
        }
        aria-label={t('item_create.place_placeholder')}
        value={value}
        maxLength={MAX_PLACE_LENGTH}
        onChange={(event) => {
          const typed = event.target.value;
          onChange(typed, null);
          setFocus(isQueryLongEnough(typed));
        }}
        onFocus={() => {
          if (isQueryLongEnough(value)) setFocus(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={t('item_create.place_placeholder')}
        className={fieldClasses()}
        autoComplete="off"
        autoCapitalize="words"
      />

      {showMenu && (
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 rounded-sm border bg-card text-card-foreground shadow-lg overflow-y-auto max-h-60 z-popover ${
            placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
          }`}
        >
          {loading && (
            <div className={MENU_MESSAGE_CLASSES}>
              {t('item_create.searching')}
            </div>
          )}

          {!loading && error && (
            <div data-testid="place-error" className={MENU_MESSAGE_CLASSES}>
              {t('item_create.search_error')}
            </div>
          )}

          {!loading &&
            !error &&
            results.map((hit, i) => {
              const { city, line2 } = formatDisplay(hit.properties);
              return (
                <button
                  key={hit.properties.osm_id}
                  data-testid="place-option"
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => choose(hit)}
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-primary/10 ${
                    i === activeIndex ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="font-medium">{city}</div>
                  <div className="opacity-70">{line2}</div>
                </button>
              );
            })}

          {!loading && !error && results.length === 0 && (
            <div className={MENU_MESSAGE_CLASSES}>
              {t('item_create.no_results')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
