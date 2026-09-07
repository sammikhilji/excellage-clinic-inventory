# Clinic Inventory

Mobile-first clinic stock app with camera barcode scanning, PWA install support, and cloud-ready persistence.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Local: JSON file store (data/store.json) when Turso env vars are unset
- Cloud: Turso / libSQL via env vars in .env.example -- no native modules
- Camera scanner via html5-qrcode
- Seeded from data/seed.csv (~131 SKUs) on first run

## Login (multi-user)

Each staff member has a unique **username + password**. Passwords are hashed with scrypt and never stored in plaintext in the database.

| Setting | Value |
|------- |-------|
| Login | Username + password (PIN gate removed / fallback OFF) |
| Session | `localStorage` key `clinic_inventory_auth` stores name + role; cookies `clinic_auth` + `clinic_user` |
| Seeded users | 11 accounts (1 admin + 10 staff) on first run / migration |
| Credentials handout | `/workspace/Clinic_Inventory_Staff_Logins.pdf` and `.csv` (clinic owner only) |

**Default admin:** username `mohamed` — temporary password is in the staff handout (not listed in this README). Change after first login.

Use **Log out** in the top bar to clear the session. Activity log records the username on add / transfer / consume / stock actions.

## Requirements

- Node 20 LTS recommended (Node 18+)
- No C++ toolchain / no node-gyp native modules

## Quick start

```bash
cd clinic-inventory
npm install
npm run dev
```

Open http://localhost:3000 — sign in with your staff username and password.

Local creates data/store.json from data/seed.csv when Turso is not configured.

## Features

- **Home** -- dashboard (totals, stock by location, expiry, recent activity)
- **Scan** -- camera or manual barcode • product detail
- **Add** -- receive stock at a location (existing SKU)
- **Add new product** -- `/products/new` creates a brand-new SKU (auto `INV-####` barcode if blank) + optional opening stock at Main Store
- **Move (Transfer)** -- FROM location • TO location (updates both holdings)
- **Use** -- consumption or sale
- **Stock list** -- browse/search via Home → Browse all stock
- **Monthly staff report** -- `/reports` (admin / manager / head nurse): who took stock from Main Store and who recorded use/sale for a selected month; Print + CSV download

## Barcodes / GTIN

Primary codes are `INV-0001` ‖ `INV-0131`. Lookup also accepts manufacturer GTINs mapped in `src/lib/barcodes.ts`.

| Product | INV code | GTIN |
|---------|---------|-----|
| Restylane Vital 1 mL | `INV-0007` | `07331689121391` |

## Cloud hosting

See DEPLOY.md:
1. Push to GitHub (sammikhilji)
2. Create a free Turso database
3. Deploy on Vercel free; set env vars from .env.example
4. Phone: open HMTPS URL • Share ‒ Add to Home Screen

## PWA

Open the HTTPS Vercel URL in Safari (iOS) or Chrome (Android).
iOS: Share, then Add to Home Screen.
Android: browser menu Install / Add to Home Screen.
Files: public/manifest.json and public/sw.js

Camera scanning requires HTTPS (or localhost).

## Locations

Main Store / Dr. Ahmad / Dr. Saly / Dr. Niveen / Dr. Sassani

## Data

Local (no Turso env): data/store.json  
Cloud (Turso env set): Turso kv table (JSON blob)


## Monthly staff report

Managers and admins (also head nurse) can open **Report** in the header or **Monthly staff report** on Home.

- Page: `/reports` — pick a month, on-screen summary, Print (`window.print`), CSV download
- API: `GET /api/reports/monthly-staff?year=YYYY&month=MM` (JSON)
- CSV: `GET /api/reports/monthly-staff.csv?year=YYYY&month=MM`
- Auth: cookie `clinic_user`; roles `admin`, `manager`, `head_nurse` (403 otherwise)
- Groups by staff username (`full_name` when known). Older activity with null username shows as **Unknown / before login tracking**.

## New products

Any logged-in staff can create a SKU via `/products/new` or **Add new product** on Home / Stock list.

- API: `POST /api/products` with `{ product, category, barcode?, unit_type, expiry?, location, initial_qty, note? }`
- Blank barcode → next `INV-####`. Opening qty > 0 creates stock + `receive` activity with username.
- **Units:** products store `unit_type` — presets include units, syringe, vial, mL, lines, box, piece, or a custom label. Shown on inventory / add / move / use.

## Scripts

`dev` / `build` / `start` (see package.json)

## Limitations

- Camera requires HTTPS or loopback
- Offline SW caches shell; stock API needs network
- Temporary passwords should be changed after first login (ask admin)
