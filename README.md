# Futebol das Segundas — tracker

React + Vite app, data stored in Supabase (Postgres) so it's shared, free, and no longer tied to a Claude Artifact/plan.

## 1. Create the Supabase project (free)

1. Go to https://supabase.com, sign up (free), and create a new project.
2. Open **SQL Editor** in the project, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the `app_state` table, sets it fully open (no login required to read/write — same behavior as before), and enables realtime updates.
3. Also run [`supabase/seed.sql`](./supabase/seed.sql) after `schema.sql` — it loads your existing players/games (from your exported backup) instead of starting empty.
4. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key (not the `service_role` key — that one must never be used in the browser).

## 2. Configure local environment

1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from step 1.4.
3. Install Node.js (LTS) if you don't have it: https://nodejs.org
4. Run:
   ```
   npm install
   npm run dev
   ```
   Opens the app locally at the printed `localhost` URL.

## 3. Deploy to Vercel (free)

1. Push this folder to a new GitHub repository.
2. Go to https://vercel.com, sign in with GitHub, click **New Project**, and import the repo.
3. Vercel auto-detects Vite. Before deploying, add the two environment variables (same names/values as your `.env`) under **Project Settings > Environment Variables**.
4. Deploy. You'll get a public `*.vercel.app` URL that anyone can open and use — no Claude account, no plan restrictions.

## Notes

- **No login/auth**: anyone with the link can read and write the shared data, matching how the Claude Artifact version worked. If that ever becomes a problem (e.g. someone messing with the data), the fix is to add real auth or at least a shared PIN check — ask if you want that added later.
- **Realtime**: open tabs update live when someone else saves changes, via a Supabase realtime subscription — this also avoids the "missed clicks under load" issue from the old hosting.
- **Backup/restore**: the in-app export/import buttons still work exactly as before (they just read/write the same JSON shape), so your existing backup habit doesn't change.
