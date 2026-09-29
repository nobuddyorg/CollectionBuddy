import { expect, type Locator, type Page } from '@playwright/test';

interface MapView {
  (): Locator;
  do: {
    close(): Promise<void>;
    frameAllPins(): Promise<void>;
    open(): Promise<void>;
    openPin(index?: number): Promise<void>;
    zoomIn(): Promise<void>;
    zoomToLocation(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
      frameAll: Locator;
      zoomIn: Locator;
      zoomOut: Locator;
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
  // Leaflet's own DOM (container, zoom control, pins, popup) is reached by class; everything else by test id.
  const root = page.locator('.leaflet-container');
  const locators = {
    buttons: {
      close: page.getByTestId('dialog-close'),
      frameAll: page.getByTestId('frame-all-pins'),
      zoomIn: page.locator('.leaflet-control-zoom-in'),
      zoomOut: page.locator('.leaflet-control-zoom-out'),
      zoomToLocation: page.getByTestId('zoom-to-location'),
    },
    pins: page.locator('.leaflet-marker-icon'),
    popup: page.locator('.leaflet-popup-content'),
    texts: {
      empty: page.getByTestId('map-empty'),
    },
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
      await expect(root).toBeHidden();
    },
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
