# Getting started

This walks through a first run of CollectionBuddy end to end: sign in, create a collection, add an item with a photo and a place, then find it again through search and the map. By the end you'll have touched most of the app's major features.

## 1. Set up the local stack

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md) to start the local Supabase stack and the web app. You'll need Docker running and a Google OAuth client (both are one-time setup, and CONTRIBUTING.md has the exact steps) — CollectionBuddy has no offline/mock mode, so a working Supabase backend is required even for this first run.

Once `npm run dev` is up, open `http://localhost:3000`.

## 2. Sign in

You're redirected straight to `/login` if you don't have a session yet. Google is the only sign-in provider — click **Sign in with Google** and complete the OAuth flow.

## 3. Create your first category

CollectionBuddy organises items into categories (e.g. "Coins", "Stamps", "Vinyl") — you always browse one category at a time. On first sign-in you have none, so the category picker is expanded and empty.

1. Type a name (e.g. `Coins`) into the text field.
2. Click the **+** button to create it.

The category becomes selected automatically, and the picker collapses down to just its name. On future visits it opens straight back on whichever category you had selected last, so there's no picking step to repeat.

## 4. Add an item

With a category selected, click the **+** button above the (currently empty) item grid. This opens the item form:

- **Title** — required.
- **Description** — free text, optional.
- **Place** — start typing a real place name (3+ characters); a dropdown of matching places appears, sourced from the free [Photon](https://photon.komoot.io/) geocoding API. Pick one.
- **Tags** — type a word and press Enter (or a comma) to add it as a chip. Add a couple.

Save. The list jumps to page 1 so you can see your new item — items are always sorted newest-first.

## 5. Add a photo

Hover the new item's card (or tap the **⋯** button on touch devices) to reveal its action row, and click the upload-image icon. Pick any image file. It's compressed client-side to WebP before upload, and a thumbnail is generated alongside the full image — the original never leaves your browser at full size, so there's no file size to think about.

Click the uploaded thumbnail to open it full-size in a lightbox.

Add a second photo and the card lays both out as a pair; a third and beyond gives the first photo a large slot with the rest as a strip beneath it. Photos keep the order you added them in, so the first one you upload stays the big one — and while a photo is still uploading, its placeholder holds exactly the slot it will end up in.

## 6. Find it again

Add one or two more items (different titles/places), then:

- Type part of a title, description, place, or tag into the search box — results filter as you type, after the third character.
- If you have more than 9 items, a page control appears at the bottom of the grid.
- Click the map icon (next to **+**) to see every item in the current category that has a place, plotted on an OpenStreetMap map. If your browser grants location access, your own position shows as a red marker too.

## 7. Everyday housekeeping

- **Edit**: pencil icon on a card's action row, same form as creation, pre-filled.
- **Delete an item**: trash icon, confirm — this also removes its uploaded images.
- **Delete a category**: expand the category picker, select the category, clear the text field, click delete. Any items that would be left with _no_ category at all are deleted along with it (items that also belong to other categories are kept).
- **Language / theme**: click your email in the header to open the user menu — German/English and System/Light/Dark are independent toggles there.

## What's next

- [User guide](../how-to/user-guide.md) covers each of these features as standalone recipes, with the edge cases.
- [Developer guide](../how-to/developer-guide.md) if you're contributing code rather than just using the app.
- [Architecture reference](../reference/architecture.md) if you want to understand the data model or how authorization works.
