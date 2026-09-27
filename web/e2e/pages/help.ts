import { type Locator, type Page } from '@playwright/test';

type HelpTopic =
  'collections' | 'entries' | 'search' | 'sharing' | 'transfer' | 'undo';

interface Help {
  (): Locator;
  do: {
    close(): Promise<void>;
    openByKeyboard(): Promise<void>;
    openFromEmptyState(): Promise<void>;
    openTopic(topic: HelpTopic): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      emptyState: Locator;
    };
    topic(topic: HelpTopic): Locator;
  };
}

export function initHelp(page: Page): Help {
  const root = page.getByTestId('help');
  const topic = (name: HelpTopic) => root.getByTestId(`help-topic-${name}`);
  const locators = {
    buttons: {
      close: page.getByTestId('dialog-close'),
      emptyState: page.getByTestId('empty-open-help'),
    },
    topic,
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    openByKeyboard: async () => {
      await page.keyboard.press('ControlOrMeta+/');
    },
    openFromEmptyState: async () => {
      await locators.buttons.emptyState.click();
    },
    openTopic: async (name: HelpTopic) => {
      await topic(name).locator('summary').click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
