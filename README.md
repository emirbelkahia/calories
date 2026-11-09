# Calories

A lean calorie tracker, with as little friction as possible. Search a food, scan a barcode, or take a photo of a plate or a nutrition label. You check the entry, then you move on. No ads, nothing else in the way. Your data stays on the device.

A **PWA**: install on iPhone from Safari, no App Store.

## What’s in place

- **Home calendar** — empty days stay gray. Today stays blue until 21:00 (under target is expected while the day is open; going over the calorie band still turns yellow or red). Closed days are green / yellow / red from the calorie band *and* the protein target (too low or too high both matter). Carbs and fat do not color the day.
- **Day journal** — breakfast, lunch, dinner by default; add named snacks. On the current day, breakfast folds at 10:00, lunch at 16:00, dinner at 21:00.
- **Macro gauges** — calories, protein, carbs, and fat fill against the daily targets. Carb and fat quotas are suggested from the calorie goal and protein (Anses fat share) and can be overridden in Settings.
- **Food logging** — CIQUAL kitchen staples first, then Open Food Facts search, manual entry, and saved custom foods (editing a saved food does not rewrite meals already logged)
- **Barcode** — live camera scan, or a photo of the code if the camera is refused; lookup on Open Food Facts
- **Label photo (optional)** — nutrition-label photo → Mistral OCR prefills the manual form
- **Plate photo (optional)** — photo of a plate → Mistral vision estimates each item (grams and macros); review before adding
- **Saved meals** — snapshot a logged meal and apply it later (copies the foods; days already logged stay as they are)
- **Settings** — Mifflin–St Jeor profile, deficit / maintain / surplus, protein g/kg, optional carb and fat quotas, optional Mistral key
- **FR / EN** — language switch (kept in settings)
- **Backup** — export / import JSON (IndexedDB is local to the device; the API key is never exported; saved meals are included)
- **Deployed** as a Vercel PWA

## Mistral photos (BYOK)

1. Create a Mistral API key
2. In the app: **Settings → Mistral API key** → paste once (persists on this device)
3. Label: **Add food → Manual → Label photo** → Extract → review → Add
4. Plate: **Add food → Search → Plate photo** → Estimate → review items → Add

No server-side Mistral key. Each user pays their own quota. Without a key, the rest of the app still works; photo controls stay hidden.

## Likely next

- Log a meal by saying it in plain language
- Sync across devices (optional cloud)
- MyFitnessPal import
- Cleaner custom domain
- Stronger offline support (install works; there is no service worker yet)

## Stack

Next.js · TypeScript · Dexie (IndexedDB) · Open Food Facts · CIQUAL staples · ZXing (barcode) · Mistral OCR and vision (optional) · Vercel

## Run locally

```bash
npm install
npm run dev
```

## Install on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**.
