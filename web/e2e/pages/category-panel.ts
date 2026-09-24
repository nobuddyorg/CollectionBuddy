import { expect, type Locator, type Page } from '@playwright/test';

interface CategoryPanel {
  (): Locator;
  do: {
    create(name: string): Promise<void>;
    delete(): Promise<void>;
    exportCollection(): Promise<void>;
    importArchive(file: string): Promise<void>;
    open(name: string): Promise<void>;
    openPanel(): Promise<void>;
    rename(name: string): Promise<void>;
  };
  locators: {
    buttons: {
      add: Locator;
      delete: Locator;
      expand: Locator;
      export: Locator;
      rename: Locator;
    };
    inputs: {
      importFile: Locator;
      newName: Locator;
      rename: Locator;
    };
    selected: Locator;
    sharedMarker: Locator;
    tabs: Locator;
    texts: {
      label: Locator;
    };
  };
  /** One tab of the strip, by the collection it names. */
  tab(name: string): Locator;
  /** The marker one tab carries when the collection is somebody else's. */
  sharedMarkerOn(name: string): Locator;
}

export function initCategoryPanel(page: Page): CategoryPanel {
  const root = page.locator('#app-root');
  const locators = {
    buttons: {
      add: root.getByTestId('add-category'),
      delete: root.getByTestId('delete-category'),
      expand: root.getByTestId('expand-categories'),
      export: root.getByTestId('export-category'),
      rename: root.getByTestId('rename-category'),
    },
    inputs: {
      importFile: root.getByTestId('import-file-input'),
      newName: root.getByTestId('new-category-input'),
      rename: root.getByTestId('rename-category-input'),
    },
    selected: root.getByTestId('selected-category'),
    sharedMarker: root.getByTestId('shared-marker'),
    tabs: root.getByTestId('category-tab'),
    texts: {
      label: root.getByTestId('category-label'),
    },
  };
  // Exact, not a substring: the import spec puts "X (2)" beside "X".
  const tab = (name: string) =>
    locators.tabs.filter({
      has: page
        .getByTestId('category-tab-name')
        .and(page.getByText(name, { exact: true })),
    });

  const openPanel = async () => {
    // The strip collapses on every selection, so whether the expand button is there depends on the last action.
    if (await locators.buttons.expand.isVisible()) {
      await locators.buttons.expand.click();
    }
  };

  const interactions = {
    create: async (name: string) => {
      await openPanel();
      await locators.inputs.newName.fill(name);
      await locators.buttons.add.click();
      await expect(locators.selected).toHaveText(name);
    },
    delete: async () => {
      await openPanel();
      await locators.buttons.delete.click();
    },
    exportCollection: async () => {
      await openPanel();
      await locators.buttons.export.click();
    },
    importArchive: async (file: string) => {
      await openPanel();
      await locators.inputs.importFile.setInputFiles(file);
    },
    open: async (name: string) => {
      await page.goto('', { waitUntil: 'networkidle' });
      // isVisible() answers immediately, so the strip has to have loaded before openPanel asks about it.
      await expect(locators.selected).not.toBeEmpty();
      await openPanel();
      await tab(name).click();
      // Selecting collapses the strip, so the heading confirms the choice; every seeded collection has a card.
      await expect(locators.selected).toHaveText(name);
      await expect(root.getByTestId('item-card').first()).toBeVisible();
    },
    openPanel,
    rename: async (name: string) => {
      await openPanel();
      await locators.inputs.rename.fill(name);
      await locators.buttons.rename.click();
      await expect(locators.selected).toHaveText(name);
    },
  };
  return Object.assign(() => root, {
    locators,
    do: interactions,
    tab,
    sharedMarkerOn: (name: string) => tab(name).getByTestId('shared-marker'),
  });
}
