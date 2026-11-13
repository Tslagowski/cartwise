# Cartwise

Phone-first shopping + grocery app: a **wishlist** of things I want, a reusable **grocery staples** list, and a **price history** of what I actually paid (store, brand, size, price, date). Replaces tracking it all in the Notes app.

**Live:** https://tslagowski.github.io/cartwise/ — open in Safari → Share → **Add to Home Screen**.

## What it does
- **Want:** wishlist grouped by brand or category (Barbour, Vuori, TVs…), with size/fit/color, target price, priority, link and notes. "Bought it" logs a purchase.
- **Groceries:** staples that stay put, grouped by store and category. Check items off as you shop, uncheck when you run low. "Log N as purchase" turns checked items into a purchase.
- **Prices:** every product with last / lowest / typical unit price ($/oz, $/lb, $/ct), so different sizes compare fairly.
- **History:** every purchase, plus this month's spend.
- **Price check while logging:** the purchase form says "Good price" or "Higher than usual" against your own history.
- **Paste from Notes:** paste an Apple Notes checklist; headings become groups/categories, checked items come in as bought/got.
- **Backup:** Settings → Export saves a JSON file (put it in iCloud Drive). Import restores it.

## How data is stored
Everything lives on your phone in IndexedDB. Nothing is sent anywhere, and there's no server or account. Export a backup now and then: Safari can clear storage for sites you haven't opened in weeks (installing to the Home Screen makes that much less likely).

## Develop
No build step, no dependencies.

```sh
npm start        # serves on http://localhost:8080
npm test         # unit tests for src/lib (offline, node --test)
```

- `src/lib/` — pure logic (units, stats, backup, Notes parser), unit-tested
- `src/app.js` — UI; `src/db.js` — IndexedDB wrapper
- `sw.js` — offline cache. **Bump `VERSION` on every release** (and `CARTWISE_VERSION` in `index.html`).
- Pushing to `main` runs the tests and deploys to GitHub Pages.

See `SPEC.md` for the plan and `decisions.md` for decisions made so far.
