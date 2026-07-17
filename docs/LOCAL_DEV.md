# Local Development Setup

Everything runs on free / open-source infrastructure. No paid accounts required.

## Stack
- **Frontend:** Next.js 15 (App Router) + React 19, TypeScript, Tailwind v4.
  Deployed on **Vercel** (free hobby tier).
- **Backend:** FastAPI on an **Oracle Cloud always-free ARM VM**
  (`gricci-testing.duckdns.org`, Caddy reverse proxy + TLS). Free.
- **Storage / DB:** **Supabase** free tier (Postgres + Storage buckets).
- **Visual QA:** **Argos** (open-source visual regression, free OSS plan).
- **CI:** **GitHub Actions** (free for public repos).
- **Transcription:** `basic-pitch` (Spotify, Apache-2.0) on the backend.
- **Sheet music:** `abcjs` (MIT) in the browser; MIDI→WAV via FluidSynth on backend.
- **In-browser LLM (Chat, disabled):** `@huggingface/transformers` (WebGPU).

## Prerequisites
- Node 20+, npm.
- A Supabase project (free). Get the project URL + anon key from
  **Settings → API**.
- (Optional) the Oracle backend URL if you want real transcription. Without it,
  the app still runs; Transcribe just needs a backend to return notes.

## 1. Install
```bash
npm install
```

## 2. Environment
Copy the example and fill in your Supabase values (all optional — the app has
built-in fallbacks so it runs with no env at all):
```bash
cp .env.example .env.local
```
`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Optional: override the Oracle backend (defaults to gricci-testing.duckdns.org)
# MUSIC_BACKEND_URL=https://gricci-testing.duckdns.org
```
> `.env.local` is gitignored. Never commit real keys.

## 3. Run the app
```bash
npm run dev        # http://localhost:3000
```
Open `http://localhost:3000/?tab=transcribe` (or just `/` then click Transcribe).

Useful scripts:
| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (hot reload) |
| `npm run build` | Production build (also what CI runs) |
| `npm run start` | Serve the production build |
| `npm run lint` | Next lint |

## 4. Run the tests locally
```bash
npx playwright install --with-deps chromium   # one-time browser install
npm run start &                                # start the app
npx playwright test tests/e2e/journey.spec.ts  # blocking user journeys
npx playwright test                            # all (incl. Argos visual specs)
```
The E2E journeys mock the backend (`/api/music/*`) so they run offline and fast.
The Library journey hits real Supabase (needs `NEXT_PUBLIC_SUPABASE_*` set) and
asserts `Saved ✓` — it guards the RLS anon-insert policy.

## 5. Backend (Oracle VM) — separate repo deploy
The backend is **not** deployed by Vercel (`.vercelignore` excludes `backend/`).
It lives on the Oracle VM and is updated out-of-band:
```bash
cd backend
pip install -r requirements.txt      # or docker compose up
uvicorn main:app --host 0.0.0.0 --port 8000
```
Backend reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env (see
`backend/.env.example`). The VM's `docker-compose.yml` wires Caddy → FastAPI.

## 6. Supabase setup
- Create buckets: `library`, `midi` (used by live features). Others (`audio`,
  `tracks`, `datasets`, `adapters`) for the disabled features.
- Apply RLS so the **anon** key can insert/select (the app is unauthenticated):
  ```sql
  create policy "anon insert library" on storage.objects for insert to anon with check (bucket_id = 'library');
  create policy "anon select library" on storage.objects for select to anon using (bucket_id = 'library');
  -- repeat for midi / other buckets as needed
  ```
  Migrations are in `supabase/migrations/`.

## 7. Visual QA (Argos) — local preview
No upload needed to render locally:
```bash
npx playwright test            # screenshots land in ./screenshots (gitignored)
```
To push diffs to Argos on PRs, add `ARGOS_TOKEN` to repo **Settings → Secrets →
Actions** (see `design/README.md`).

## Troubleshooting
- **Transcribe stuck / no sound:** needs the Oracle backend reachable and a valid
  abcjs soundfont (already configured in `components/Score.tsx`). Offline, the
  score still renders; only synth playback needs the backend + network.
- **Playwright can't find browser:** run `npx playwright install --with-deps chromium`.
- **Supabase 403 on upload:** RLS anon policy missing — apply the policies above.
