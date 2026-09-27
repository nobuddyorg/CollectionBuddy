// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import de from '../i18n/de.json';
import en from '../i18n/en.json';
import { I18nProvider } from '../i18n/I18nProvider';
import PrivacyPage from './page';

// jsdom keeps localStorage across a file's tests; reset so each starts from the detected language.
beforeEach(() => {
  localStorage.clear();
  document.title = 'CollectionBuddy';
});

function renderPage() {
  return render(
    <I18nProvider>
      <PrivacyPage />
    </I18nProvider>,
  );
}

describe('PrivacyPage', () => {
  it('names the controller and links the contact address, untranslated', () => {
    renderPage();
    expect(screen.getByTestId('privacy-controller')).toHaveTextContent(
      'Matthias Eggert',
    );
    expect(screen.getByTestId('privacy-contact')).toHaveAttribute(
      'href',
      'mailto:info@nobuddy.org',
    );
  });

  it('shows every sentence of the notice in English', () => {
    renderPage();
    const text = document.body.textContent ?? '';
    for (const sentence of Object.values(en.privacy).filter(
      (value) => value !== en.privacy.link,
    )) {
      expect(text).toContain(sentence);
    }
  });

  it('shows the notice in German when German is chosen', () => {
    localStorage.setItem('lang', 'de');
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Datenschutzhinweis' }),
    ).toBeVisible();
    expect(document.body).toHaveTextContent(de.privacy.rights_complaint);
  });

  it('gives each section a heading below the title', () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7);
  });

  it('leads back to the app', () => {
    renderPage();
    expect(screen.getByTestId('privacy-back')).toHaveAttribute('href', '/');
  });

  it('names the tab after the notice, and restores the title when left', () => {
    const { unmount } = renderPage();
    expect(document.title).toBe('Privacy notice · CollectionBuddy');
    unmount();
    expect(document.title).toBe('CollectionBuddy');
  });
});
