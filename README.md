# Cartwise

Phone-first shopping + grocery app: a **wishlist** of things I want, a reusable **grocery staples** list, and a **price history** of what I actually paid (store, brand, size, price, date). Replaces tracking it all in the Notes app.

**Live:** https://tslagowski.github.io/cartwise/ — open in Safari → Share → **Add to Home Screen**.

## What it does
- **Want:** wishlist grouped by brand or category (Barbour, Vuori, TVs…) as a list or photo grid, with size/fit/color, target price, priority, link, notes and a photo (from your camera roll or pulled from the link).
- **Groceries:** staples that stay put, grouped by store and category. **Start shopping** shows only what you need, in big rows, and keeps the screen on. "Log N as purchase" turns what's in your cart into a purchase.
- **Prices:** every product with last / lowest / typical unit price ($/oz, $/lb, $/ct), a trend sparkline, and a green / gray / orange dot for whether the last price was good, typical or high. **Scan** a barcode in the store to check a price.
- **History:** purchases by month, plus this month's spend.
- **Fast logging:** each item is one row (name + price; the last price is pre-filled). Details hide behind "⋯". Scan items to add them.
- **Gestures:** swipe right to check off / mark bought, swipe left to delete (with Undo). The + button adds whatever fits the tab you're on.
- **Paste from Notes:** paste an Apple Notes checklist; headings become groups/categories, checked items come in as bought/got.
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
