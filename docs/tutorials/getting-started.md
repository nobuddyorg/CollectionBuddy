# Getting started

A first run of CollectionBuddy end to end: sign in, create a category, add an
item with a photo and a place, then find it again through search and the map.

## 1. Start the app

Follow [Try the local demo](../../CONTRIBUTING.md#try-the-local-demo) — Docker
and the Supabase CLI, then `npm run demo`. It signs you in automatically as an
anonymous local user, so there is no sign-in step. Open `http://localhost:3000`.

If you set up [Google sign-in](../../CONTRIBUTING.md#local-development) instead
and run `npm run dev`, the app sends you to `/login` first: click **Sign in
with Google** and complete the flow.

## 2. Create your first category

Items live in categories ("Coins", "Stamps", "Vinyl"), and you browse one at
a time. On first sign-in you have none, so the category picker is open and
empty.

1. Type a name into the text field.
2. Click **+**.

The category is selected, and the picker collapses to its name. Next time,
the app opens on whichever category you had selected last.

## 3. Add an item

Click **+** above the empty item grid.

- **Title** — required.
- **Description** — optional.
- **Place** — type three or more characters of a real place name and pick one
  of the suggestions. Picking a suggestion is what puts the item on the map.
- **Tags** — type a word and press Enter or comma to add it as a chip.

Save. Items sort newest first, and the list jumps to page 1 so you see it.

## 4. Add a photo

Hover the card (or tap **⋯** on a touch screen) to show its action row, click
the upload icon, and pick any image. The browser compresses it to WebP and
makes a thumbnail before uploading, so a full-size phone photo is fine.

Click the thumbnail to open it full size. A second photo makes a pair; from the
third on, the first photo gets the large slot and the rest form a strip under
it. Photos keep the order you added them in.

## 5. Find it again

Add one or two more items with different titles and places, then:

- Type part of a title, description, place, or tag into the search box. Results
  filter from the third character.
- With more than nine items, a page control appears under the grid.
- Click the map icon next to **+** to see every item in the category that has
  a place, pinned on a map. If you allow location access, your own position
  shows as a red marker.

## 6. Housekeeping

- **Edit**: pencil icon on the action row — the same form, pre-filled.
- **Delete an item**: trash icon, confirm. Its photos go with it.
- **Delete a category**: open the picker, select the category, clear the text
  field, click delete. Items that would be left with no category are deleted
  too; items that also belong to another category stay.
- **Language and theme**: click your email in the header. German/English and
  System/Light/Dark are independent.

## What's next

- [User guide](../how-to/user-guide.md): each feature as a recipe, with the
  edge cases — sharing, import/export, the map.
- [Developer guide](../how-to/developer-guide.md) if you are contributing code.
- [Architecture](../reference/architecture.md) for the data model and how
  authorization works.
