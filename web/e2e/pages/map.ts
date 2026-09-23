import { expect, type Locator, type Page } from '@playwright/test';

interface MapView {
  (): Locator;
  do: {
    frameAllPins(): Promise<void>;
    open(): Promise<void>;
    openPin(index?: number): Promise<void>;
    zoomIn(): Promise<void>;
    zoomToLocation(): Promise<void>;
  };
  /** The pins and the popup are Leaflet's own DOM, the one place reached by class rather than a test id. */
  locators: {
    buttons: {
      frameAll: Locator;
      zoomIn: Locator;
      zoomToLocation: Locator;
    };
    pins: Locator;
    popup: Locator;
    texts: {
      empty: Locator;
    };
  };
}

export function initMap(page: Page): MapView {
  const root = page.locator('.leaflet-container');
  const locators = {
    buttons: {
      frameAll: page.getByTestId('frame-all-pins'),
      zoomIn: page.locator('.leaflet-control-zoom-in'),
      zoomToLocation: page.getByTestId('zoom-to-location'),
    },
    pins: page.locator('.leaflet-marker-icon'),
    popup: page.locator('.leaflet-popup-content'),
    texts: {
      empty: page.getByTestId('map-empty'),
    },
  };
  const interactions = {
    frameAllPins: async () => {
      await locators.buttons.frameAll.click();
    },
    // The button belongs to the catalogue; waiting for the map to be there belongs here.
    open: async () => {
      await page.getByTestId('open-map').click();
      await expect(root).toBeVisible();
    },
    openPin: async (index = 0) => {
      await locators.pins.nth(index).click();
    },
    // One step only: Leaflet swallows a second click sent mid-animation, and one carries a fitted pin off screen.
    zoomIn: async () => {
      await locators.buttons.zoomIn.click();
    },
    zoomToLocation: async () => {
      await locators.buttons.zoomToLocation.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
