// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, type TranslationKey } from './I18nProvider';
import { useI18n } from './useI18n';
import realEn from './en.json';

function Probe() {
  const { lang, setLang, t, tCount } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="close">{t('common.close')}</span>
      <span data-testid="missing">
        {t('nope.not.a.real.key' as TranslationKey)}
      </span>
      <span data-testid="tags-0">{tCount('item_create.tags_count', 0)}</span>
      <span data-testid="tags-1">{tCount('item_create.tags_count', 1)}</span>
      <span data-testid="tags-2">{tCount('item_create.tags_count', 2)}</span>
      <span data-testid="no-plural-variant">{tCount('common.close', 1)}</span>
      <span data-testid="no-key-at-all">
        {tCount('nope.not.real' as TranslationKey, 1)}
      </span>
      <button type="button" onClick={() => setLang('en')}>
        English
      </button>
      <button type="button" onClick={() => setLang('de')}>
        Deutsch
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
}

describe('I18nProvider', () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    localStorage.clear();
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  });

  afterEach(() => {
    meta.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects a language stored from a previous visit', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('falls back to the browser language when nothing is stored', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'de-DE',
    });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('falls back to English when neither storage nor the browser names a supported language', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'fr-FR',
    });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('ignores a stored value that is not one of the supported languages', () => {
    localStorage.setItem('lang', 'fr');
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'de-DE',
    });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('falls back to English when reading the stored language throws', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    vi.stubGlobal('navigator', {
      ...navigator,
      language: 'fr-FR',
    });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    getItem.mockRestore();
  });

  it('persists a chosen language and reflects it immediately', async () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    expect(screen.getByTestId('close')).toHaveTextContent('Close');

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
    expect(screen.getByTestId('close')).toHaveTextContent('Schließen');
    expect(localStorage.getItem('lang')).toBe('de');
  });

  it('falls back to the key itself for a translation that does not exist', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('missing')).toHaveTextContent(
      'nope.not.a.real.key',
    );
  });

  it('keeps html lang and the meta description in sync with the active language', async () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    expect(document.documentElement.lang).toBe('en');
    expect(meta.getAttribute('content')).toBe('Collect • Organize • Keep');

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    expect(document.documentElement.lang).toBe('de');
    expect(meta.getAttribute('content')).toBe('Sammeln • Ordnen • Behalten');
  });

  // A defensive fallback against `page.footer` disappearing from a
  // translations file without this hardcoded reference being updated --
  // the parity test only guards `t()`/`tCount()` literals, not this direct
  // `resolveTranslationKey` call, so nothing else in the suite catches it.
  it('falls back to an empty meta description when the active language is missing page.footer', async () => {
    vi.resetModules();
    vi.doMock('./en.json', () => ({
      default: { ...realEn, page: { ...realEn.page, footer: undefined } },
    }));
    const { I18nProvider: FreshProvider } = await import('./I18nProvider');
    const { useI18n: freshUseI18n } = await import('./useI18n');
    function FreshProbe() {
      const { lang } = freshUseI18n();
      return <span data-testid="lang">{lang}</span>;
    }
    localStorage.setItem('lang', 'en');

    render(
      <FreshProvider>
        <FreshProbe />
      </FreshProvider>,
    );

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(meta.getAttribute('content')).toBe('');
    vi.doUnmock('./en.json');
    vi.resetModules();
  });

  it('tolerates a document with no meta description tag at all', () => {
    meta.remove();
    localStorage.setItem('lang', 'en');
    expect(() => renderProbe()).not.toThrow();
  });

  it('picks the singular form for a count of exactly one, in either language', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    // Plain `.textContent` equality, not `toHaveTextContent`: that matcher
    // does a substring match, and "1 tag" is a substring of the plural
    // "1 tags", so it can't tell a wrongly-pluralized answer from a
    // correct one.
    expect(screen.getByTestId('tags-1').textContent).toBe('1 tag');
    expect(screen.getByTestId('tags-0').textContent).toBe('0 tags');
    expect(screen.getByTestId('tags-2').textContent).toBe('2 tags');
  });

  it('falls back to the base key when a key has no _one plural variant', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('no-plural-variant')).toHaveTextContent('Close');
  });

  it('falls back to the raw key when neither it nor its _one variant resolves to anything', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('no-key-at-all')).toHaveTextContent(
      'nope.not.real',
    );
  });

  it('reads the language that is current when called, not the one active when the closure was captured', async () => {
    localStorage.setItem('lang', 'en');
    const { result } = renderHook(() => useI18n(), {
      wrapper: I18nProvider,
    });
    const tBeforeSwitch = result.current.t;

    await act(async () => {
      result.current.setLang('de');
    });

    // Same function identity throughout (that's the whole point of the
    // langRef indirection) -- but it must answer for German now, not the
    // English it was created under.
    expect(result.current.t).toBe(tBeforeSwitch);
    expect(tBeforeSwitch('common.close')).toBe('Schließen');
  });
});
