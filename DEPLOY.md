# Deploy Clinic Inventory

This guide gets you a public HTTPS URL that works when your PC is off, and that you can Add to Home Screen on iPhone/Android as a PWA (camera scanning needs HTTPS).

Chosen stack (recommended):
- GitHub — source code (account: sammikhilji)
- Vercel (free Hobby) — hosts the Next.js app
- Turso (free) — persistent database (Vercel disk is temporary; local data/store.json does not survive there)

Local Mac still works without Turso: if TURSO_* env vars are missing, the app uses data/store.json.

---

## 0. What you need

- GitHub account sammikhilji (already connected to Cursor)
- A free Vercel account at https://vercel.com (sign up with GitHub)
- A free Turso account at https://turso.tech (sign up with GitHub)
- Optional: Turso CLI, or use the Turso web dashboard only

---

## 1. Create a GitHub repo and push this project

### Option A — from Cursor / terminal on your Mac

```bash
cd clinic-inventory
git init
git add .
git commit -m "Clinic inventory ready for Vercel + Turso"
```

Create an empty repo on GitHub (e.g. clinic-inventory), no README/license, then:

```bash
git branch -M main
git remote add origin https://github.com/sammikhilji/clinic-inventory.git
git push -u origin main
```

(Adjust the repo name if you chose a different one.)

### Option B — GitHub website upload

1. github.com -> New repository -> name clinic-inventory -> Create.
2. Upload the project files (do not upload node_modules or .next).

---

## 2. Create a free Turso database

1. Go to https://turso.tech and sign up with GitHub.
2. Create a database (any name, e.g. clinic-inventory).
3. Copy the Database URL (looks like libsql://clinic-inventory-xxxx.turso.io).
4. Create and copy an Auth Token for that database.

CLI alternative (optional):

```bash
turso auth login
turso db create clinic-inventory
turso db show clinic-inventory --url
turso db tokens create clinic-inventory
```

Save both values for the next step.

---

## 3. Deploy on Vercel (free)

1. Go to https://vercel.com -> Add New -> Project.
2. Import the clinic-inventory GitHub repo (authorize GitHub if asked).
3. Framework preset should be Next.js. Leave build settings default
   (Build Command: next build / npm run build).
4. Before Deploy, open Environment Variables and add:

   | Name | Value |
   |------|-------|
   | TURSO_DATABASE_URL | your Turso URL (libsql://...) |
   | TURSO_AUTH_TOKEN | your Turso auth token |

   Apply both to Production (and Preview if you want).
5. Click Deploy. Wait 1-2 minutes.
6. Open the URL Vercel gives you, e.g. https://clinic-inventory-xxxx.vercel.app

First visit seeds about 131 products from data/seed.csv into Turso.
Later visits keep your stock changes.

Custom domain is optional. Free *.vercel.app is enough for PWA and camera.

---

## 4. Verify it works

1. Open the HTTPS URL on your phone (cellular or Wi-Fi -- PC can be off).
2. Dashboard should show products / stock.
3. Try Add or Use with barcode INV-0001.
4. Refresh -- the change should still be there (Turso persistence).

If the app loads but stock resets every deploy/cold start, env vars are missing -- re-check step 3.

---

## 5. Add to Home Screen (PWA)

### iPhone (Safari)

1. Open the HTTPS Vercel URL in Safari (not in-app browsers).
2. Tap Share -> Add to Home Screen.
3. Confirm. Open from the home screen icon (standalone).
4. Allow camera when you use Scan / Add / Use.

### Android (Chrome)

1. Open the HTTPS URL in Chrome.
2. Menu -> Install app or Add to Home Screen.
3. Allow camera when prompted.

Manifest: /manifest.json - Service worker: /sw.js (registered automatically).

---

## 6. Local Mac (still works without Turso)

```bash
cd clinic-inventory
nmp install
npm run dev
```

Do not set TURSO* locally unless you want the Mac to use the same cloud DB.
With no env vars -> data/store.json is created/used as before.

---

## Env vars summary

| Variable | Required on Vercel | Required on Mac | Purpose |
|---------|----------------|---------------|--------|
| TURSO_DATABASE_URL | Yes | No | LibSQL / Turso connection URL |
| TURSO_AUTH_TOKEN | Yes | No | Turso auth token |

No other secrets needed. No better-sqlite3 / native modules.

---

## Updating the app later

```bash
git add .
git commit -m "Describe your change"
git push
```

Vercel auto-redeploys from main. Turso data is not wiped by a redeploy.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Build fails on Vercel | Check build logs; ensure package-lock.json was pushed; Node 20. |
| Empty inventory every time | Turso env vars not set on Vercel -> add them and Redeploy. |
| Camera blocked | Must use HTTPS (Vercel URL) or localhost; grant permission. |
| Add to Home Screen missing | Use Safari on iOS; open the real HTTPS URL. |
| Want to re-seed cloud data | In Turso SQL console: DELETE FROM kv WHERE key = 'store'; then reload the app. |

---

## Why not only JSON on Render?

Render/Railway free tiers can keep a JSON file on a disk volume, but setup (Dockerfile, volumes, sleep/wake) is harder for non-technical users. Vercel + Turso stays click-through free, always HTTPS, and works with the GitHub account you already have.

An optional long-running host path is not required for this project.
