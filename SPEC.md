# Cartwise — Spec

> Written to be handed straight to a coding agent (Claude Code, Codex, etc.).
> Draft from the first chat (2026-11-12), updated after seeing my real Notes lists.
> Not grilled yet: items marked "agent decides" have a default and can change after a grill session.
> v0.1.0 (M1–M3) is built. v0.2.0 added the mobile UX pass (M5). v0.3.0 reorganizes the app (M6) — where this spec and M6 disagree with older sections, M6 wins.

## 1. Summary
Cartwise is a phone-first PWA that replaces tracking shopping in the iPhone Notes app. It keeps a **wishlist** of things I want, a **grocery list**, and a **purchase history** (store, product, brand, size, price, date) in one on-device database. The most important outcome: every purchase I record builds a price history I can check later ("is this a good price?").

## 2. Goals / Non-goals
**Goals (v1)**
- Record purchases quickly on the phone: store, date, and line items with product, brand, size/unit, price, quantity, on-sale flag
- Price history per product, with unit price ($/oz, $/lb, $/ct…) so sizes compare fairly
- Wishlist ("Want") items grouped by brand or category, with size/fit/color details, optional target price, priority, link and notes; "Bought it" records a purchase
- Grocery **staples** list that persists between trips, grouped by store and category (Protein, Carbs, Fats, Other); check off while shopping, uncheck when running low, log checked items as a purchase
- Paste an Apple Notes checklist to import wishlist or grocery items (headings → groups/categories; a heading directly above another heading → store)
- Export all data to a JSON file and import it back (backup to iCloud Drive via the share sheet)
- Works offline after the first load; installable to the home screen

**Later**
- Receipt capture with on-device text recognition
- "You usually buy X every N days" suggestions on the grocery list
- Spend trends by store, category and month
- Optional free cloud sync

**Non-goals**
- Native iOS / App Store
- Accounts, sharing, multiple users
- Scraping store prices (see the Local Deals Tracker and Data Collector ideas)
- Any AI at runtime

## 3. Users & core flows
Just me, on an iPhone 14 Pro Max, in Safari or from the home screen.

1. **Log a purchase:** History tab → "+ Purchase" → pick or type a store, date defaults to today → add line items (product name autocompletes from past products; brand, size, unit, price, qty, sale) → save. Empty store or no line items: Save stays disabled.
2. **Check a price:** search a product → see last, lowest, and typical (median) unit price, and every past purchase with store and date. A product with no purchases shows "No price history yet."
3. **Want something:** Want tab → add item (name, brand/group, size/fit, optional target price, link, notes) → later "Bought it" opens the purchase form pre-filled and moves it to Bought.
4. **Groceries:** staples stay on the list. Unchecked = need, checked = got. In the store, check items off → "Log N as purchase" opens the purchase form with those items (they stay checked and won't be logged twice) → "Uncheck all" starts the next list.
5. **Import from Notes:** Settings or an empty tab → Paste from Notes → choose Wishlist or Groceries → paste → Import.
6. **Back up:** Settings → Export → share sheet → save the JSON to Files/iCloud Drive. Import replaces all data after a confirm.

## 4. Requirements
**Functional**
- [x] FR1 — Create, edit, delete stores, products, purchases (trips) and line items
- [x] FR2 — Unit price computed from price, qty, size and unit; units normalized within a family (weight: oz/lb/g/kg → $/oz; volume: fl oz/ml/l/gal → $/fl oz; count → $/ct)
- [x] FR3 — Per-product stats: last, lowest, median unit price; count of purchases; last store
- [x] FR4 — Wishlist CRUD with group, details, target price, priority; "Bought it" flow
- [x] FR5 — Grocery staples CRUD with category/store, check-off, uncheck-all, "Log checked as purchase" flow
- [x] FR8 — Import Apple Notes checklists into wishlist or groceries
- [x] FR6 — Export/import all data as versioned JSON
- [x] FR7 — Search products by name or brand

**Non-functional**
- Cost: $0/month. GitHub Pages hosting, no backend
- Data stays on the device (IndexedDB); request persistent storage
- Phone-first layout for a 430 px-wide screen; usable one-handed
- Offline after first load (service worker)
- No build step required (agent decides: plain ES modules)

## 5. Technical approach
- **Stack:** HTML + CSS + vanilla JS (ES modules), no framework, no build step. Hosted on GitHub Pages via a GitHub Actions deploy.
- **Storage:** IndexedDB through a small wrapper. Stores:
  - `stores` {id, name}
  - `products` {id, name, brand, category, defaultSize, defaultUnit, barcode}
  - `trips` {id, storeId, date, note, createdAt}
  - `lines` {id, tripId, productId, price, qty, size, unit, onSale}
  - `wants` {id, name, brand, category, details, priority: Low|Medium|High, targetPrice?, url?, notes, image (data URL or https URL), sitePrice?, sitePriceAt?, status: open|bought, createdAt, boughtAt?, v}
  - `settings` {id, value} — `brandSizes`: { [brand lowercase]: { brand, sizes: [string] } }
  - `groceries` {id, name, brand, qty, details, boughtDates?, snoozeUntil?, aisle, store, status: need|cart|stocked, lastBought?, createdAt, v}
- **External services:** Microlink (`api.microlink.io`, free tier, no key; as of 2026-11 the free plan allows only 5 lookups/day, reported in `x-rate-limit-*` headers) only when "From link" is tapped on a wishlist item. Nothing else leaves the phone.
- **Vendored libraries:** `vendor/zxing.min.js` (@zxing/library 0.21.3, lazy-loaded for barcode scanning on iPhone, where Safari has no BarcodeDetector).
- **Tests:** pure logic (unit conversion, stats, export/import shape) in `src/lib/`, tested with `node --test`, offline.

## 6. Milestones
1. **M1 — Skeleton:** repo, CI running tests, PWA shell (manifest, service worker, three tabs) deployed to GitHub Pages
2. **M2 — Core flow:** purchases, products, price history and stats, export/import
3. **M3 — Want + Groceries:** wishlist and grocery staples with their "bought" flows, plus Notes import
4. **M4 — Polish:** search, edit/delete everywhere, empty states, persistent-storage prompt
5. **M5 — Mobile UX (v0.2.0):**
   - Compact purchase rows (name + price; brand/qty/size/sale/barcode behind "⋯"); empty price falls back to the last price shown as the placeholder
   - Swipe right = check off / mark bought, swipe left = delete (with Undo) on groceries, wants and purchases
   - Floating + button for the current tab
   - Grocery shopping mode: only what's needed plus what's in the cart, bigger rows, screen kept awake, sticky "Log N as purchase"; staples remember the store they were bought at
   - Wishlist images (photo from the phone, or "From link" via the free Microlink preview API), list or 2-column grid
   - Price sparklines and good/typical/high dots in Prices and the product sheet
   - iOS-style grouped lists, SF-style tab icons, haptic tap on check-off/swipe, dark mode tuned
   - Barcode scan: add an item in the purchase form, price-check from Prices, store a product's barcode

### M6 — Reorganize (v0.3.0)
Organized like dedicated list apps (AnyList, Reminders, Bring!), not like the Notes lists it replaced.
- **Three tabs:** Groceries, Wishlist, Prices (Items | Trips). Header shows the tab name with a contextual + and Settings.
- **Groceries:** one list sorted by store aisle (Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry, Frozen, Snacks, Drinks, Spices & Sauces, Health, Household, Pet, Other), auto-assigned from the item name and editable. Quick-add box with suggestions from your usuals. Tap the circle to put it in the cart, the rest of the row to edit; "In cart" sits at the bottom. "Finish shopping" → Log prices or Clear cart. Items you're not buying now live in **Your usuals** (tap a chip to add back). Store chips filter the list when items have more than one usual store.
- **Wishlist:** category chips (All, Clothing, Kitchen, Home, Tech, Other, Bought) with counts and search. All = sections by category with brand on each row; one category = sections by brand. Brand, size/fit and notes are fields. Must-have items get a star; target price shows as a pill; photos only when added.
- **Swipe to reveal:** swiping left only reveals buttons (Edit/Remove, Bought/Delete, Delete). Nothing happens until a button is tapped; tapping elsewhere closes the row. Deletes offer Undo.
- **v0.4.0:** grocery items get **Qty** (free text, e.g. "2 bags") and **Details** (type, brand, size, flavor). Names typed or imported as "Potatoes (gold/russet/sweet)" split into name + details; existing items are upgraded once (schema v3) and matching products are renamed so price history stays linked. Compact layout pass (smaller header, rows, chips; inputs stay at 16px so iOS doesn't zoom).
- **v0.4.1:** smaller default text (15px body). iOS input auto-zoom is blocked with `maximum-scale=1` in the viewport (pinch-zoom still works in Safari), so inputs no longer need 16px. Settings → Text size (Smaller / Default / Larger) scales the whole UI with CSS zoom, saved per device.
- **v0.4.2:** updates reliably on the Home Screen app: the service worker fetches with `cache: 'no-cache'` (GitHub Pages sends max-age=600), installs with `cache: 'reload'`, registers with `updateViaCache: 'none'`, checks for updates on launch, on returning to the foreground and every 30 minutes, and reloads once a new version takes over ("Updated to vX" toast).
- **v0.4.3:** "Get photo from link" explains failures (rate limit with reset time, page without an image) and warns when 2 or fewer lookups are left. New "Paste photo" reads an image copied in Safari (long-press → Copy) from the clipboard — free and unlimited. Toasts now appear above open sheets (they were hidden behind the dialog's top layer).
- **v0.4.4:** "+ New aisle" in the grocery item sheet. Custom aisles live on the items that use them and sort after the built-in aisles, before Other.
- **v0.4.5:** grocery rows match the wishlist: the circle (a wide tap target on the left edge) toggles the cart, tapping anywhere else opens Edit. Swipe left now only offers Remove.
- **v0.4.6:** grocery items get a **Brand** field (suggestions from brands used anywhere in the app). Rows show "Brand · details"; logging prices from the cart pre-fills the brand.
- **v0.4.7:** Your usuals stays open and in place while you tap several chips (scroll is compensated, with temporary bottom space on short lists). Usual chips and quick-add suggestions show brand · details. Items are identified by id, not name: quick-add only reuses an item when the name (plus details if typed) matches exactly one; otherwise it lists the matches plus "Add as a new item". Notes import de-dupes on name + details. Grocery row prices prefer the same brand's history.
- **v0.4.8:** photo paste falls back to iPhone's native paste menu: if the clipboard API is refused or finds nothing, a "Long-press here, then tap Paste" box appears. Native paste events anywhere in the wish sheet accept image files, HTML containing an `<img>`, or an image URL; a pasted page URL fills Link. Text pastes into fields are left alone.
- **v0.4.9:** "Get photo from link" tries Shopify first: `/products/<handle>.json` (CORS open on Shopify stores) gives photo (variant-aware), title, vendor, variant and current price with no lookup service and no limit; Microlink is the fallback for other sites. The site price is saved on the wish (`sitePrice`, `sitePriceAt`) and shown on its row. The photo picker accepts WebP/AVIF/HEIC explicitly, since images saved from shops may be hidden by a plain image/* filter.
- **v0.5.0:** one-step photo paste: "Hold to paste photo" is itself the paste target (long-press → Paste). The clipboard-API "Paste photo" button is gone — on iPhone it needed an extra permission tap and didn't return copied images.
- **v0.5.1:** paste button reads "Tap to paste photo", then "Tap again, then Paste" once selected (iPhone only shows its Paste menu on a second tap or a long-press).
- **v0.6.0 — habits:**
  - **Running low:** a card at the top of Groceries suggests usuals that are due, based on the median gap between purchase dates (logged trips with the same name/brand, plus days you finished shopping with the item in the cart; `groceries.boughtDates`, last 12). Needs 2+ dates. Add, Add all, or swipe → Not now (snoozes for half the usual gap, min 2 days; `snoozeUntil`).
  - **My sizes:** sizes saved per brand (`settings` store, id `brandSizes`). In the wish sheet, picking a brand shows your saved sizes plus sizes used on other wishes from that brand; tap to use, "+ Save … as my size" to keep one; a single saved size fills in automatically. Settings → My sizes lists, adds and removes them.
  - IndexedDB v2 adds the `settings` store; backups include it, older backups still import.
- **Migration:** on load, old records are upgraded (`groceries.status` need|cart|stocked + `aisle`; `wants.brand` + `category` from the old heading, with heading notes like "(wait for $40 deals)" moved into notes).

## 7. Acceptance criteria
- Given a purchase of "Greek yogurt, 32 oz, $5.99" when I view the product then unit price shows $0.19/oz
- Given three purchases at $0.19, $0.15, $0.22/oz when I view stats then last, lowest $0.15 and median $0.19 are shown
- Given data in the app when I export then import on a cleared browser then all records match
- Given the app was loaded once when the phone is offline then it opens and shows my data
- Given a wishlist item when I tap "Bought it" and save then the item is marked bought and a purchase exists

## 8. Risks & open questions
- Safari may evict IndexedDB data for sites not used in a while → export reminder plus persistent-storage request (agent decides: remind after 14 days without export)
- Categories: agent decides — free-form text with autocomplete
- Stores: agent decides — free-form with autocomplete

## 9. Agent instructions
- Keep it dependency-free beyond what's in `vendor/`; ask before adding any library
- Pure logic goes in `src/lib/` with tests; UI code may stay untested
- Never add a backend or paid service
- Bump the service worker cache version on every deploy
