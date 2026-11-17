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

## Product lookup service (optional)
`worker/` is a tiny Cloudflare Worker that reads product pages for the app (name, brand, price, photo) so links fill in without the 5-a-day limit. It deploys automatically from GitHub Actions to https://cartwise-lookup.trevisslagowski.workers.dev once the `CLOUDFLARE_API_TOKEN` repository secret exists (Cloudflare → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"). The account ID is in `worker/wrangler.toml`.

## Wardrobe validation preview

Open [Wardrobe Preview](https://tslagowski.github.io/cartwise/experimental/wardrobe/) in iPhone Safari. Wait for **Ready offline** before trying airplane mode. To check the installed app, add the preview itself to your Home Screen. Preview photos and outfits are experimental, local, and excluded from Cartwise backups.

For the validation exercise, add 5–10 real pieces, save two outfits, and add one prospective purchase to see how it works with your closet. Share what was useful, where capture felt slow, what information was missing, and whether to continue, change direction, or stop.

M1 browser check on macOS with an emulated iPhone 14 Pro Max viewport. Playwright WebKit 27.2 and Chromium 159 passed at 375, 390, and 430 CSS px. The cached closet loaded ten test photos offline in 73 ms in WebKit and 31 ms in Chromium. Physical iPhone Safari, the Home Screen app, and the real-piece exercise still need an owner check.

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
- `experimental/wardrobe/` — validation preview with its own IndexedDB database and service worker. With `npm start`, open `/experimental/wardrobe/`. Bump its cache version when changing the preview shell.
- Pushing to `main` runs the tests and deploys to GitHub Pages.

See `SPEC.md` for the plan and `decisions.md` for decisions made so far.
