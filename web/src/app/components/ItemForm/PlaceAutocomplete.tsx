'use client';
import { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useI18n } from '../../i18n/useI18n';
import { usePhotonSearch } from './usePhoton';

const MIN_Q = 3;

export function PlaceAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t, locale } = useI18n() as unknown as {
    t: (k: string) => string;
    locale?: string;
  };
  const {
    setQuery,
    focus,
    setFocus,
    results,
    loading,
    activeIdx,
    dropdownRef,
    inputRef,
    menuRef,
    choose,
    onKeyDown,
  } = usePhotonSearch(locale);

  // keep hook query in sync with controlled value
  useEffect(() => {
    setQuery(value);
    if (value.trim().length >= MIN_Q) setFocus(true);
  }, [value, setQuery, setFocus]);

  return (
    <div className="relative" ref={dropdownRef}>
      <input
        ref={inputRef}
        aria-label={t('item_create.place_placeholder')}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          const len = v.trim().length;
          if (len === 0) {
            // reset interaction
            setFocus(true);
          } else if (len < MIN_Q) {
            // hide / clear when too short
            setFocus(false);
          } else {
            setFocus(true);
          }
        }}
        onFocus={() => {
          if (value.trim().length >= MIN_Q) setFocus(true);
        }}
        onKeyDown={(e) => {
          const maybeLabel = onKeyDown(e);
          if (typeof maybeLabel === 'string') onChange(maybeLabel);
        }}
        placeholder={t('item_create.place_placeholder')}
        className="w-full rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 outline-none focus:border-primary dark:focus:border-primary"
        autoComplete="off"
      />

      {focus &&
        (loading || results.length > 0) &&
        ReactDOM.createPortal(
          (() => {
            const r = inputRef.current?.getBoundingClientRect();
            if (!r) return null;
            return (
              <div
                ref={menuRef}
                className="fixed rounded-xl border bg-card dark:bg-card shadow-lg overflow-hidden z-[2000]"
                style={{ top: r.bottom, left: r.left, width: r.width }}
              >
                {loading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {t('item_create.searching')}
                  </div>
                )}

                {!loading &&
                  results.map((hit, i) => {
                    const p = hit.properties;
                    const city =
                      p.city || p.town || p.village || p.municipality || p.name;
                    const line2 = [p.state, p.country]
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <button
                        key={p.osm_id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={() => onChange(choose(hit))}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-primary/10 dark:hover:bg-primary/10 ${
                          i === activeIdx
                            ? 'bg-primary/10 dark:bg-primary/10'
                            : ''
                        }`}
                      >
                        <div className="font-medium">{city}</div>
                        <div className="opacity-70">{line2}</div>
                      </button>
                    );
                  })}

                {!loading && results.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {t('item_create.no_results')}
                  </div>
                )}
              </div>
            );
          })(),
          document.body,
        )}
    </div>
  );
}
