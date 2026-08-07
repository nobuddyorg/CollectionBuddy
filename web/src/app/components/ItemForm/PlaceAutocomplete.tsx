'use client';
import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { usePhotonSearch } from './usePhoton';
import type { PlaceCoords } from './types';

const MIN_Q = 3;
const ESTIMATED_MENU_HEIGHT = 240;

// `onChange` always says what the coordinates are now, never just what the
// text is: passing null for a hand-typed edit is how stale coordinates are
// stopped from outliving the name they were looked up for.
export function PlaceAutocomplete({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string, coords: PlaceCoords | null) => void;
}) {
  const { t, lang } = useI18n();
  const {
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    error,
    activeIdx,
    dropdownRef,
    inputRef,
    menuRef,
    choose,
    onKeyDown,
  } = usePhotonSearch(lang);
  const listId = useId();

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  const showMenu = focus && (loading || results.length > 0 || error);

  // Whether there's more room below the input than above it -- decides
  // which side the menu opens on. The menu is positioned with `absolute`
  // inside the anchor below, so (unlike the old fixed/portaled version) it
  // moves with the input for free on scroll; only the below/above choice
  // needs recomputing, and only when the menu's presence or size changes.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  useEffect(() => {
    if (!showMenu) return;
    const compute = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuHeight = menuRef.current?.offsetHeight ?? ESTIMATED_MENU_HEIGHT;
      const spaceBelow = window.innerHeight - r.bottom;
      setPlacement(
        spaceBelow < menuHeight && r.top > spaceBelow ? 'above' : 'below',
      );
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMenu, results.length, loading, error]);

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showMenu && activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined
        }
        aria-label={t('item_create.place_placeholder')}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          // Typed by hand, so whatever coordinates were attached belong to
          // a place that is no longer what this field says.
          onChange(v, null);
          const len = v.trim().length;
          if (len < MIN_Q) {
            setFocus(false);
          } else {
            setFocus(true);
          }
        }}
        onFocus={() => {
          if (value.trim().length >= MIN_Q) setFocus(true);
        }}
        onKeyDown={(e) => {
          const picked = onKeyDown(e);
          if (picked) {
            onChange(picked.label, picked.coords);
            setFocus(false);
          }
        }}
        placeholder={t('item_create.place_placeholder')}
        className="w-full rounded-sm px-3 py-2 min-h-11 bg-card text-card-foreground ring-1 ring-inset ring-border focus:ring-foreground"
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
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t('item_create.searching')}
            </div>
          )}

          {!loading && error && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t('item_create.search_error')}
            </div>
          )}

          {!loading &&
            !error &&
            results.map((hit, i) => {
              const p = hit.properties;
              const city =
                p.city || p.town || p.village || p.municipality || p.name;
              const line2 = [p.state, p.country].filter(Boolean).join(', ');
              return (
                <button
                  key={p.osm_id}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => {
                    const picked = choose(hit);
                    onChange(picked.label, picked.coords);
                    setFocus(false);
                  }}
                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-primary/10 ${
                    i === activeIdx ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="font-medium">{city}</div>
                  <div className="opacity-70">{line2}</div>
                </button>
              );
            })}

          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t('item_create.no_results')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
