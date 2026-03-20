# Lilt

Lilt is a production-ready MVP for a private Anki-style flashcard web app.

It ships with:

- Next.js App Router + Tailwind CSS v4
- Supabase-ready Google OAuth architecture
- Local demo mode so the app runs without secrets
- Private nested folders and decks
- Rich front/back card editing with images, tables, and code blocks
- Anki-inspired review flow with `Again / Hard / Good / Easy`
- Dashboard stats, onboarding states, and keyboard shortcuts

## What works now

- Local runnable demo workspace with seeded content
- Google sign-in button and Supabase client wiring
- Private data model and Supabase migration with RLS
- Deck and folder CRUD
- Card CRUD
- Responsive light-theme-first UI
- Review queue with persistent scheduling state
- Cards studied today metric
- Keyboard shortcuts in review mode:
  - `Space` or `Enter`: flip card
  - `1`: Again
  - `2`: Hard
  - `3`: Good
  - `4`: Easy
  - `Esc`: exit review

## Local run

1. Install dependencies:

```bash
npm install
```

2. Copy env vars if you want live Supabase auth and persistence:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

If you do not provide Supabase env vars, the app still works in demo mode with local browser persistence.

## Environment variables

Set these in `.env.local` for real auth + database persistence:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Supabase setup

1. Create a Supabase project.
2. Copy the project URL and anon key into `.env.local`.
3. Run the SQL migration in [supabase/migrations/20260320_init.sql](/data/.openclaw/workspace/anki-clone-app/supabase/migrations/20260320_init.sql).
4. In Supabase Auth, enable the Google provider.
5. Add your local and deployed app URLs as redirect URLs.
6. Restart the Next.js app.

After that, Google sign-in will create user-scoped workspaces backed by Postgres.

## Deploy

Recommended path:

1. Push this repo to GitHub.
2. Create a Vercel project from the repo.
3. Create a Supabase project.
4. Run the migration from [supabase/migrations/20260320_init.sql](/data/.openclaw/workspace/anki-clone-app/supabase/migrations/20260320_init.sql).
5. In Vercel, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. In Supabase Google auth settings, add the deployed Vercel URL as an allowed redirect URL.
7. Redeploy.

## Data model

The migration creates:

- `profiles`
- `decks`
- `cards`
- `review_states`
- `study_events`

All app tables use row-level security and are scoped to `auth.uid()`.

## Notes on images

For MVP speed, uploaded card images are embedded directly into the rich text as data URLs. That keeps local/demo mode simple and makes the app runnable without extra storage configuration.

If you want to harden this for heavier production usage, the next upgrade is moving card media to Supabase Storage and storing file references instead of inline data.

## Verification

Run:

```bash
npm run lint
npm run build
```
