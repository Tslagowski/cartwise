# Cartwise

Phone-first shopping + grocery app: a **wishlist** of things I want, a reusable **grocery staples** list, and a **price history** of what I actually paid (store, brand, size, price, date). Replaces tracking it all in the Notes app.

**Live:** https://tslagowski.github.io/cartwise/ — open in Safari → Share → **Add to Home Screen**.

## What it does
- **Groceries:** one list sorted by store aisle. Type in the quick-add box (it suggests your usuals), tap an item to put it in the cart, then **Finish shopping** to log prices or just clear the cart. Things you're not buying right now live in **Your usuals**, one tap to add back. Filter by store if you shop at more than one.
- **Wishlist:** filter by category (Clothing, Kitchen, Home, Tech…) with counts and search. Each wish has a brand, size/fit, target price, priority (★ must-have), link, notes and an optional photo.
- **Prices:** every item with its last price, unit price, trend line and a green / gray / orange dot (good / typical / high). **Scan** a barcode to check a price in the store. **Trips** shows past shopping trips and this month's spend.
- **Safe gestures:** swipe left on a row to reveal its buttons (Edit, Remove, Bought, Delete). Nothing happens until you tap one, and deletes can be undone.
- **Paste from Notes:** paste an Apple Notes checklist; Cartwise sorts groceries into aisles and wishes into categories, using headings as brands.
- **Backup:** Settings → Export saves a JSON file (put it in iCloud Drive). Import restores it.

## How data is stored
Everything lives on your phone in IndexedDB. There's no server or account. The only network call is the optional "From link" image lookup, which sends that one link to Microlink's free preview API. Export a backup now and then: Safari can clear storage for sites you haven't opened in weeks (installing to the Home Screen makes that much less likely).

## Develop
No build step, no dependencies.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests for src/lib (offline, node --test)
```

- `src/lib/` — pure logic (units, stats, backup, Notes parser), unit-tested
- `src/app.js` — UI; `src/db.js` — IndexedDB wrapper; `src/scanner.js` — barcode scanner
- `vendor/zxing.min.js` — @zxing/library 0.21.3 (license in `vendor/zxing.LICENSE`), loaded only when scanning on iPhone
- `sw.js` — offline cache. **Bump `VERSION` on every release** (and `CARTWISE_VERSION` in `index.html`).
- Pushing to `main` runs the tests and deploys to GitHub Pages.

See `SPEC.md` for the plan and `decisions.md` for decisions made so far.
