# Cartwise — Decisions

Running log from grill sessions. One row per question answered. Big or hard-to-reverse decisions also get an ADR in `docs/adr/`; link it in the last column.

| # | Date | Question | Decision | Why | ADR |
|---|---|---|---|---|---|
| 6 | Wishlist grouped by brand/category headings from Notes | #13: category chips, brand is a field | Cluttered; headings mixed brands and categories |
| 7 | Staples list with Need/Got and nutrition categories | #13: aisle-sorted list, usuals, cart | Easier to shop and update |
| 3 | Want / Groceries / History tabs (+ Prices) | #13: Groceries / Wishlist / Prices (Items, Trips) | Fewer tabs, history lives with prices |
| 1 | 2026-11-12 | Native iOS or PWA? | PWA | Native without the $99/yr Apple Developer account means reinstalling every 7 days and no iCloud sync; a PWA can be built and updated from the phone | |
| 2 | 2026-11-12 | Database? | On-device (IndexedDB) with JSON export/import | Wanted small, local, free, no Supabase-style setup | |
| 3 | 2026-11-12 | Separate shopping and grocery apps? | One app (Want, Groceries, History) | Same data underneath; groceries lean on price, shopping leans on wanting | |
| 4 | 2026-11-12 | Name | Cartwise | Covers wants and groceries, not only price tracking | |
| 5 | 2026-11-12 | Public on the App Store? | No, just me | Not needed | |
| 6 | 2026-11-12 | How is the wishlist organized? | Grouped by brand or category, with size/fit/color details per item | Matches how I already keep it in Notes (Barbour, Vuori, TVs…) | |
| 7 | 2026-11-12 | Is the grocery list cleared after each trip? | No. It's a staples list: unchecked = need, checked = got; "Uncheck all" starts a new list | My Notes grocery list is a reusable staples list grouped by category and store | |
| 8 | 2026-11-12 | How do I get my existing lists in? | Paste from Notes (checklist text parser) | Avoids retyping ~120 items | |
| 9 | 2026-11-12 | Barcode scanning on iPhone? | Vendor @zxing/library (lazy-loaded); use BarcodeDetector where it exists | Safari has no BarcodeDetector; ZXing is free and runs fully on the phone | |
| 10 | 2026-11-12 | Wishlist images? | Photo from the phone (downscaled, stored on device) or "From link" via Microlink's free API | No backend allowed, so pages can't be scraped directly; Microlink is free with no setup and only runs when tapped | |
| 11 | 2026-11-12 | Read prices from store links? | Not in v0.2 | Needs a server to fetch and parse store pages; conflicts with $0 / no backend | |
| 12 | 2026-11-12 | Should swipes act immediately? | No. Swipe left only reveals action buttons; tap to confirm; deletes have Undo | Full-swipe delete/bought was too easy to trigger by accident | |
| 13 | 2026-11-12 | How should the app be organized? | Reinvented around list-app patterns: 3 tabs; groceries by store aisle with usuals + cart; wishlist by category chips with brand as a field | v0.2 copied the Notes structure and felt cluttered; Notes layout is not a requirement | |

## Superseded
Decisions that were later changed. Keep them, so agents don't re-propose them.

| # | Was | Replaced by | Why |
|---|---|---|---|
