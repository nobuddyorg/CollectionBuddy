'use client';
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useI18n } from '../../i18n/useI18n';
import { usePhotonSearch } from './usePhoton';

const MIN_Q = 3;
const ESTIMATED_MENU_HEIGHT = 240;

type MenuPos = {
  left: number;
  width: number;
  placement: 'below' | 'above';
  anchorTop: number;
  anchorBottom: number;
};

export function PlaceAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
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

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  const showMenu = focus && (loading || results.length > 0 || error);

  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  useEffect(() => {
    if (!showMenu) {
      setMenuPos(null);
      return;
    }
    const compute = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuHeight = menuRef.current?.offsetHeight ?? ESTIMATED_MENU_HEIGHT;
      const spaceBelow = window.innerHeight - r.bottom;
      const placement =
        spaceBelow < menuHeight && r.top > spaceBelow ? 'above' : 'below';
      setMenuPos({
        left: r.left,
        width: r.width,
        placement,
        anchorTop: r.top,
        anchorBottom: r.bottom,
      });
    };
    compute();
    // Capture phase so this also fires for scrolling inside a scrollable
    // ancestor (e.g. the edit modal body), not just window-level scroll.
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMenu, results.length, loading, error]);

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
          const maybeLabel = onKeyDown(e);
          if (typeof maybeLabel === 'string') {
            onChange(maybeLabel);
            setFocus(false);
          }
        }}
        placeholder={t('item_create.place_placeholder')}
        className="w-full rounded-xl border px-3 py-2 bg-card/60 dark:bg-card/70 focus:border-primary dark:focus:border-primary"
        autoComplete="off"
      />

      {showMenu &&
        menuPos &&
        ReactDOM.createPortal(
          (() => {
            const style: React.CSSProperties =
              menuPos.placement === 'below'
                ? {
                    top: menuPos.anchorBottom,
                    left: menuPos.left,
                    width: menuPos.width,
                  }
                : {
                    bottom: window.innerHeight - menuPos.anchorTop,
                    left: menuPos.left,
                    width: menuPos.width,
                  };
            return (
              <div
                ref={menuRef}
                className="fixed rounded-xl border bg-card dark:bg-card shadow-lg overflow-y-auto max-h-60 z-popover"
                style={style}
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
                        onClick={() => {
                          onChange(choose(hit));
                          setFocus(false);
                        }}
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

                {!loading && !error && results.length === 0 && (
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
