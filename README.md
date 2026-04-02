# Iron Ledger

Local-first workout tracker PWA (iPhone Safari + PC) with optional cloud sync via Supabase.

## App structure (routes)

- `/` — Dashboard (streak, next workout, recent sessions)
- `/workouts` — Saved routines; start empty or from a template
- `/workout` — Live session (reps, weight, rest timer, save template)
- `/stats` — Weight/height trends, TDEE estimate, goals, progress photos
- `/profile` — Google sign-in and manual sync

## Run locally

Install:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Use on your iPhone (same Wi‑Fi)

1. Run the dev server.
2. Find your PC’s LAN IP (Windows): `ipconfig` → look for **IPv4 Address**.
3. On iPhone Safari, open `http://<your-ip>:5173`.
4. (Optional) Add to home screen: Share → **Add to Home Screen**.

## Production build

```bash
npm run build
npm run preview
```

## Enable cloud sync (Supabase)

### Troubleshooting: “missing Supabase env”

Vite only reads env when the **dev server starts** or when you **run `npm run build`**. If keys look correct but the app still says they’re missing:

- Put `.env` in the **project root** (next to `package.json`), not in `src/`.
- Names must be exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the `VITE_` prefix is required).
- After editing `.env`, **restart** `npm run dev` (stop the terminal, start again).
- If you use `npm run preview`, rebuild after changing env: `npm run build` then `npm run preview`.
- On Windows, confirm the file is not `.env.txt` (enable “File name extensions” in Explorer).

### 1) Create environment file

Vite reads **`.env`** in the project root — **not** `.env.example`. Either copy the template:

```bash
copy .env.example .env
```

(on macOS/Linux: `cp .env.example .env`), then edit `.env` with your Supabase URL and anon key.

Or create `.env` manually:

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### 2) Supabase Auth

- In Supabase: **Authentication → Providers → Google** → enable it.
- Add your redirect URL(s):
  - Local dev: `http://localhost:5173`
  - Your deployed site origin (e.g. `https://your-site.pages.dev`)

### 3) Supabase tables you need

Create these tables (names match what the app uses): `exercises`, `templates`, `sessions`, `sets`, `photos`.

Minimum columns (snake_case in Supabase):
- `id uuid primary key`
- `user_id uuid not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz null`

Entity columns used by the app:
- `exercises`: `name text`, `slug text`
- `templates`: `name text`, `exercise_slugs text[]`
- `sessions`: `date timestamptz`, `body_weight numeric null`, `height numeric null`
- `sets`: `session_id uuid`, `exercise_id uuid`, `weight numeric null`, `reps int null`, `set_index int`, `is_completed boolean`
- `photos`: `date timestamptz`, `storage_path text null`

Enable **RLS** and allow each user to read/write only their own rows (by `user_id = auth.uid()`).

### 4) Supabase Storage (photos)

- Create a storage bucket named: `photos`
- Recommended: keep it private and use signed URLs (the app does this).

