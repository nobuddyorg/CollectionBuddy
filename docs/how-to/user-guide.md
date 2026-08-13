# User guide

Task-oriented recipes for using CollectionBuddy. If you haven't used the app before, [Getting started](../tutorials/getting-started.md) is a better first read; come back here when you need a specific answer.

## Sign in / sign out

Google is the only sign-in provider (`/login`). Signing out (user menu → **Sign out**) revokes the session on the server; if that call fails (e.g. you're offline), it falls back to clearing the session locally so you're never stuck "signed in" on a device with no network.

## Manage categories

Categories are the top-level grouping — you always browse one at a time.

- **Create**: type a name in the category picker and click **+**. Names must be non-blank and are unique per account, case-insensitively (`Coins` and `coins` collide).
- **Switch**: open the picker (if collapsed, click the expand button next to the current category name) and pick from the dropdown.
- **Rename**: open the picker, select the category, edit the name in the text field, and confirm. The same rules as creation apply — non-blank, and unique per account case-insensitively — and the server normalises what you typed, so the name that comes back is what gets stored.
- **Delete**: select the category, clear the search/name field, click delete, confirm. Deleting a category also deletes any items that would be left belonging to _no_ category as a result — items shared with another category survive.

The picker opens collapsed, on whichever category you had selected last, so you won't see the dropdown at all unless you open it yourself or haven't picked one before.

## Share a category

Sharing gives another CollectionBuddy account read-only access to a category: its items, tags, places, and photographs, but no ability to add, edit, or delete anything. There's no public-link option — only an existing account can be granted access.

- **Share**: open the category picker, select the category, and enter the other person's email in the share field. Optionally pick an expiry date. Click the share icon. There's no separate accept step — the grant starts working the moment that email signs in, even if it's the first time.
- **Set an expiry**: pick a date before sharing; access ends at the end of that day. Leave it blank for no expiry.
- **Revoke access**: find the person in the shared-with list and click the trash icon beside their email, confirm.
- **Leave a category shared with you**: a category someone else shared with you shows the same delete control as your own categories — for a shared one it leaves it instead, and doesn't affect the owner's copy.

## Import and export a category

- **Export**: select a category, click **Export**. Downloads a `.zip` archive containing every item's metadata and photographs. Large categories can take a while — the button reports progress, and **Cancel** stops it mid-run.
- **Import**: click **Import** and pick a `.zip` file previously exported from CollectionBuddy. Creates a new category from its contents. If the name is already taken, it's suffixed automatically (`Coins (2)`) rather than overwriting or failing.

## Add, edit, and delete items

- **Add**: with a category open, click the **+** button above the item grid.
- **Edit**: hover a card (or tap **⋯** on touch) to reveal its action row, click the pencil icon. Same form as creation, pre-filled.
- **Delete**: trash icon on the action row, then confirm. This deletes the item's uploaded images first, then the item itself.

Fields:

| Field       | Notes                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | Required.                                                                                                                                                                                         |
| Description | Optional, free text.                                                                                                                                                                              |
| Place       | Optional. Autocompletes after 3 characters via the [Photon](https://photon.komoot.io/) geocoding API — pick a suggestion rather than typing free text if you want the item to show up on the map. |
| Tags        | Optional. Type a word, press Enter or comma to add it as a chip; Backspace on an empty tag field removes the last chip. Duplicates are ignored.                                                   |

The server trims whitespace, drops blank fields to empty, and normalizes/sorts tags — what you see after saving may be tidied up slightly from what you typed.

## Manage photos

- **Upload**: action row → upload-image icon → pick a file (any image format your browser can read; a full-size phone photo is fine). It's compressed and converted to WebP client-side before upload, with a thumbnail generated alongside it — no manual resizing needed.
- **View full size**: click a thumbnail to open it in a lightbox (Escape or the backdrop closes it).
- **Delete**: open the lightbox or use the per-image delete control, confirm.

An item can have any number of photos.

## Search and pagination

Type into the search box above the item grid — it searches title, description, place, and tags together, starting from the third character (shorter queries show the unfiltered list rather than empty results). Clear it with the **×** button once there's text.

Up to seven pages — 63 items, at nine per page — every page number is shown. Beyond that the control collapses to first/last plus a sliding window around your current page, with `…` in between.

## View items on a map

Click the map icon (next to **+**) to open a map of the items in the current category that have a place set. Geocoding results are cached in your browser, so reopening the map for the same category won't look places up again. If you allow location access, your current position shows as a red marker; the "zoom to current location" and "frame all pins" buttons in the map are quick ways to reorient.

The map shows the same items the grid does: an active search narrows the pins too, and the same third-character threshold applies, so a one- or two-character query leaves both unfiltered. Unlike the grid, the map is not paginated — it draws every match, not just the page you're on. Changing the search while the map is open re-draws and re-frames it.

Only items with a **place** set appear — an item without one simply won't show on the map.

## Language and theme

Open the user menu (click your email in the header) for two independent toggles:

- **Language** (_Sprache_): Deutsch / English. Auto-detected from your browser on first visit, then remembered.
- **Appearance** (_Darstellung_): System / Light / Dark. The default is System, which tracks your OS setting live — including a change made while the app is open. Picking Light or Dark overrides the OS until you switch back to System. Either way the page changes as you click, and the choice is remembered on the next visit.

## Accessibility

The app is built to work with a keyboard and screen reader: dialogs trap focus and close on Escape, destructive-confirmation dialogs default focus to **Cancel** rather than the destructive action, and live regions announce result counts for search and place autocomplete since their dropdowns render outside normal reading order.
