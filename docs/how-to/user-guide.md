# User guide

Recipes for specific tasks. New to the app? Start with
[Getting started](../tutorials/getting-started.md).

## Sign in and out

Google is the only sign-in (`/login`). **Sign out** is in the user menu (click
your email in the header). If the sign-out request fails — you are offline,
say — the session is cleared locally anyway, so you are never stuck signed in
on a device without network.

## Categories

You always browse one category at a time.

- **Create**: type a name in the category picker, click **+**. Names must be
  non-blank and are unique per account, case-insensitively — `Coins` and
  `coins` collide.
- **Switch**: open the picker (the expand button next to the current name) and
  pick from the list.
- **Rename**: select the category, edit the name in the text field, confirm.
  Same rules as creation. Whitespace is trimmed and collapsed on save.
- **Delete**: select the category, clear the text field, click delete, confirm.
  Items that would be left with no category are deleted too; items that also
  belong to another category stay.

The picker opens collapsed on the category you had selected last.

## Share a category

Sharing gives another CollectionBuddy account access to one category: its
items, tags, places, and photos. There is no public link — only an account
can be granted access, and it is read-only until you say otherwise.

- **Share**: select the category, enter the other person's email in the share
  field, optionally pick an expiry date, click the share icon. There is no
  accept step: the grant works the moment that email signs in, even for the
  first time.
- **Let someone edit**: tick **Can edit** beside their name (on a narrow screen,
  the pen icon opens the same choice) and confirm. They can then add, change
  and delete items and photos in that category — marked **Editor** in the
  list. They still cannot rename it, delete it, or share it; those stay with
  you, as does taking edit access away again.
- **Expiry**: access ends at the end of the chosen day. Blank means no expiry.
- **Revoke**: trash icon beside the email in the shared-with list, confirm.
- **Leave a category shared with you**: the delete control on a shared category
  leaves it instead. The owner's copy is untouched.

## Import and export a category

- **Export**: select a category, click **Export**. You get a `.zip` with every
  item's data and photos. Large categories take a while; the button shows
  progress and **Cancel** stops it.
- **Import**: click **Import**, pick a `.zip` exported from CollectionBuddy. It
  becomes a new category. A taken name gets a suffix (`Coins (2)`) rather than
  overwriting or failing.

## Items

- **Add**: **+** above the item grid.
- **Edit**: hover a card (tap **⋯** on touch) for its action row, then the
  pencil icon.
- **Delete**: trash icon on the action row, confirm. Photos are deleted first,
  then the item.

| Field | Notes |
| --- | --- |
| Title | Required. |
| Description | Optional. |
| Place | Optional. Suggestions appear from the third character, from the [Photon](https://photon.komoot.io/) geocoder. Pick a suggestion if you want the item on the map; free text is kept but not pinned. |
| Tags | Optional. Enter or comma adds a chip; Backspace on an empty tag field removes the last one. Duplicates are ignored. |

On save, whitespace is trimmed, blank fields become empty, and tags are
deduplicated and sorted.

## Photos

- **Upload**: action row → upload icon → any image your browser can read. It
  is compressed to WebP with a thumbnail before upload, so there is no size to
  worry about.
- **View full size**: click a thumbnail. Escape or the backdrop closes it.
- **Delete**: from the full-size view or the per-photo control, confirm.

An item can have any number of photos, in the order you added them.

## Search and pages

The search box above the grid matches title, description, place, and tags at
once, from the third character; one or two characters show the unfiltered
list. **×** clears it.

Nine items per page. Up to seven pages, every page number is shown; beyond
that the control shows first, last, and a window around the current page.

## Map

The map icon next to **+** opens a map of every item in the category that has
a place. An active search narrows the pins the same way it narrows the grid,
but the map is not paged — it draws every match. Geocoding results are cached
in your browser, so reopening the map for the same category does not look
places up again.

If you allow location access, your position shows as a red marker; the map has
buttons to zoom to it and to frame all pins.

## Language and theme

Two independent settings in the user menu:

- **Language** (_Sprache_): Deutsch / English. Detected from your browser on
  first visit, then remembered.
- **Appearance** (_Darstellung_): System / Light / Dark. System follows your
  OS setting live. Light or Dark overrides it until you switch back.

## Accessibility

The app works with a keyboard and a screen reader: dialogs trap focus and close
on Escape, confirmation dialogs focus **Cancel** rather than the destructive
action, and result counts for search and place suggestions are announced,
since their dropdowns render outside normal reading order.
