import { type Page } from '@playwright/test';

import { initAccountMenu } from './account-menu';
import { initCatalogue } from './catalogue';
import { initCategoryPanel } from './category-panel';
import { initConfirm, initImageViewer, initToast } from './dialogs';
import { initEntryForm } from './entry-form';
import { initLoginPage } from './login';
import { initMap } from './map';
import { initSharingPanel } from './sharing';

/** Getters, so a spec that wants one screen builds only that screen's locators. */
export type PageTree = ReturnType<typeof createPageTree>;

export function createPageTree(page: Page) {
  return {
    get account() {
      return initAccountMenu(page);
    },
    get catalogue() {
      return initCatalogue(page);
    },
    get categories() {
      return initCategoryPanel(page);
    },
    get confirm() {
      return initConfirm(page);
    },
    get form() {
      return initEntryForm(page);
    },
    get login() {
      return initLoginPage(page);
    },
    get map() {
      return initMap(page);
    },
    get sharing() {
      return initSharingPanel(page);
    },
    get toast() {
      return initToast(page);
    },
    get viewer() {
      return initImageViewer(page);
    },
  };
}
