# User guide

Task-oriented recipes for using CollectionBuddy. If you haven't used the app before, [Getting started](../tutorials/getting-started.md) is a better first read; come back here when you need a specific answer.

## Sign in / sign out

Google is the only sign-in provider (`/login`). Signing out (user menu → **Sign out**) revokes the session on the server; if that call fails (e.g. you're offline), it falls back to clearing the session locally so you're never stuck "signed in" on a device with no network.

## Manage categories

Categories are the top-level grouping — you always browse one at a time.

- **Create**: type a name in the category picker and click **+**. Names must be non-blank and are unique per account, case-insensitively (`Coins` and `coins` collide).
- **Switch**: open the picker (if collapsed, click the expand button next to the current category name) and pick from the dropdown.
- **Delete**: select the category, clear the search/name field, click delete, confirm. Deleting a category also deletes any items that would be left belonging to *no* category as a result — items shared with another category survive.

If you only ever have one category, the picker auto-collapses and auto-selects it on load, so you won't see the dropdown at all until you create a second one.

## Add, edit, and delete items

- **Add**: with a category open, click the **+** button above the item grid.
- **Edit**: hover a card (or tap **⋯** on touch) to reveal its action row, click the pencil icon. Same form as creation, pre-filled.
- **Delete**: trash icon on the action row, then confirm. This deletes the item's uploaded images first, then the item itself.

Fields:

| Field | Notes |
|---|---|
| Title | Required. |
| Description | Optional, free text. |
| Place | Optional. Autocompletes after 3 characters via the [Photon](https://photon.komoot.io/) geocoding API — pick a suggestion rather than typing free text if you want the item to show up on the map. |
| Tags | Optional. Type a word, press Enter or comma to add it as a chip; Backspace on an empty tag field removes the last chip. Duplicates are ignored. |

The server trims whitespace, drops blank fields to empty, and normalizes/sorts tags — what you see after saving may be tidied up slightly from what you typed.

## Manage photos

- **Upload**: action row → upload-image icon → pick a file (any common image format, up to 5 MB). It's compressed and converted to WebP client-side before upload, with a thumbnail generated alongside it — no manual resizing needed.
- **View full size**: click a thumbnail to open it in a lightbox (Escape or the backdrop closes it).
- **Delete**: open the lightbox or use the per-image delete control, confirm.

An item can have any number of photos.

## Search and pagination

Type into the search box above the item grid — it searches title, description, place, and tags together, starting from the third character (shorter queries show the unfiltered list rather than empty results). Clear it with the **×** button once there's text.

Below 10 items, all pages show as individual numbers; beyond that, the page control collapses to first/last plus a sliding window around your current page, with `…` in between.

## View items on a map

Click the map icon (next to **+**) to open a map of every item in the current category that has a place set. Geocoding results are cached in your browser, so reopening the map for the same category won't look places up again. If you allow location access, your current position shows as a red marker; the "zoom to current location" and "frame all pins" buttons in the map are quick ways to reorient.

Only items with a **place** set appear — an item without one simply won't show on the map.

## Language and theme

Open the user menu (click your email in the header) for two independent toggles:

- **Language**: Deutsch / English. Auto-detected from your browser on first visit, then remembered.
- **Theme**: System / Light / Dark. "System" tracks your OS setting live, including changes made while the app is open.

## Accessibility

The app is built to work with a keyboard and screen reader: dialogs trap focus and close on Escape, destructive-confirmation dialogs default focus to **Cancel** rather than the destructive action, and live regions announce result counts for search and place autocomplete since their dropdowns render outside normal reading order.
