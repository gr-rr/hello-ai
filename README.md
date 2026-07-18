# hello-ai · Audio → Sheet Music

Turn audio into MIDI and **playable sheet music**. Upload or record audio, get a
transcription (basic-pitch on an Oracle VM), and a synthesized, cursor-highlighted
score you can play back in the browser (abcjs). Files persist to Supabase.

## Live features

- 📁 **Library** (`/?tab=library`) — upload + manage audio in Supabase.
- 🎼 **Transcribe** (`/?tab=transcribe`) — audio → MIDI (basic-pitch) → rendered
  sheet music with playback.

The app is a single-page Studio with Library and Transcribe tabs. Analysis
features are rendered inline after transcription.

## Documentation

| Doc | What it covers |
|-----|----------------|
| [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) | Local setup on the free/OSS stack (Vercel + Oracle + Supabase) |
| [docs/TOOLING.md](docs/TOOLING.md) | Libraries, services, and config files |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram + the design→build→test→ship loop |
| [design/README.md](design/README.md) | Design system (tokens, mockups, Argos visual QA) |

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) for the
full setup (env, tests, backend, Supabase RLS).

## CI / merge gate

- **`build`** (required) — builds the app and runs the blocking Playwright user
  journeys in `tests/e2e/journey.spec.ts` (Transcribe + Library). A broken core
  flow cannot merge.
- **`argos`** (non-blocking) — visual diff vs `main` baseline, for review.

## Deploy

Deploy to [Vercel](https://vercel.com) — connect the repo; it builds with the
included `vercel.json` (Next.js framework preset).

### Environment variables (Vercel + local `.env.local`)

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public, browser-safe) |
| `MUSIC_BACKEND_URL` | Oracle FastAPI backend base URL (default `https://gricci-testing.duckdns.org`) |

Without the Supabase vars the app falls back to built-in demo values; without the
backend, Transcribe can't return notes.

## Server-side generation (Oracle Cloud, always-free)

Transcription runs on an Oracle Cloud **Ampere A1** VM (4 OCPU / 24 GB ARM,
Ubuntu 22.04) behind Caddy TLS. The Next.js `/api/music/*` routes proxy to the
backend. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Architecture

```
Browser ──▶ Vercel (/api/generate) ──▶ Oracle VM
                                     Caddy :443 (HTTPS/Let's Encrypt) ──▶ FastAPI :8000 (MusicGen)
                                                                             └─▶ Supabase (upload)
```

### Provisioning (via `oci` CLI)

All infra is created from the CLI (no console clicking required):

```bash
# Auth: ~/.oci/config (tenancy/user OCID + API key at ~/.oci/oci_api_key.pem)
oci iam user get --user-id <user-ocid>          # verify auth

# Network
oci network vcn create --compartment-id <tenancy> --cidr-block 10.0.0.0/16
oci network internet-gateway create --vcn-id <vcn> --is-enabled true
oci network subnet create --vcn-id <vcn> --cidr-block 10.0.0.0/24
oci network route-table update --rt-id <rt> --force \
  --route-rules '[{"destination":"0.0.0.0/0","destination-type":"CIDR_BLOCK","network-entity-id":"<igw>"}]'
# Security list: open 22/80/443/8000 (use --force, ingress rules silently drop otherwise)
oci compute instance launch --from-json instance.json --region us-phoenix-1
```

> Gotcha: `route-table update` and `security-list update` require `--force` or
> the new rules are silently ignored.

### Backend on the VM

```bash
# On the VM (Ubuntu 22.04 ARM):
sudo apt-get install -y docker-ce docker-compose-plugin
# Copy backend/ (tar, exclude .venv) to /home/ubuntu/backend, then:
cd /home/ubuntu/backend && docker compose up -d   # FastAPI :8000 + Caddy :80

# Server-side Supabase upload (optional): create /home/ubuntu/backend/.env
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>       # secret, never exposed to browser
```

The `backend/` directory contains:
- `main.py` — FastAPI app (`/health`, `/generate`, `/train`, `/jobs/{id}`, `/compare`, `/models`, `/models/base`)
- `musicgen_server.py` — MusicGen via `transformers` + `torch` (MPS/CUDA/CPU)
- `finetune_server.py` — PEFT LoRA training + inference (Unsloth if CUDA, else vanilla `transformers`)
- `requirements.txt`, `Dockerfile`, `docker-compose.yml` (Caddy + backend)

> **Env gotcha:** `docker compose` only injects `.env` vars into the container
> when run **from the `backend/` directory** (so it reads `backend/.env`). Running
> `docker compose -f ~/backend/docker-compose.yml …` from elsewhere substitutes
> empty strings and the backend silently runs with no Supabase config. Always
> `cd ~/backend && docker compose up -d`. The `backend/.env` needs:
> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret), `ADAPTER_ROOT=/data/adapters`.

## Finetune Lab (LoRA fine-tuning)

Fine-tune small LLMs (TinyLlama-1.1B, SmolLM2-135M/1.7B — all Apache-2.0) with
LoRA on the Oracle backend. Training runs on **CPU** (the always-free VM has no
GPU), so keep datasets small and epochs low; a 1.1B model on a few rows takes a
few minutes.

### Flow

1. **Datasets** (`/data`) — paste/upload JSONL (`instruction` / optional `input` /
   `output`), or load the starter dataset / generate synthetic rows. Saved to the
   Supabase `datasets` bucket.
2. **Train** (`/train`) — pick base model + dataset, set LoRA hyperparams, start.
   The job runs as a FastAPI `BackgroundTasks` coroutine; status is polled from the
   Supabase `jobs` table every 3s. The resulting adapter is saved to the `adapters`
   bucket and a `models` row is inserted.
3. **Compare** (`/compare`) — same prompt through two models (base vs a fine-tuned
   adapter) rendered side-by-side.

### Architecture

```
Browser ──▶ Vercel (/api/train,/api/compare,/api/jobs) ──▶ Oracle VM
          Caddy :443 ──▶ FastAPI :8000
                            ├─ /train  → BackgroundTasks → PEFT LoRA → adapters bucket
                            ├─ /compare → load base + adapter → generate twice
                            └─ Supabase: jobs / models tables, datasets / adapters buckets
```

Unsloth is used automatically **only when CUDA is available** (its Triton kernels
require a GPU). On CPU the code falls back to vanilla `transformers` + `peft`,
which is the same ~10-line API — so the wrap is thin and a GPU shape is a drop-in
later.

## Persistence (Supabase)

- `lib/supabase.ts` — client singleton. `lib/storage.ts` — generic bucket helpers (single source for uploads). `lib/backend.ts` — single reverse-proxy to the Oracle backend.
- Migration: `supabase/migrations/20260716_init_tracks.sql` (apply via the SQL
  Editor or `supabase db push --linked`).
- Table `public.tracks` + `audio` storage bucket + RLS policies (public read/insert
  for the open demo — tighten with auth later).
- Finetune tables: `supabase/migrations/20260716_finetune_studio.sql`
  (`jobs`, `models` tables + `datasets` / `adapters` buckets + RLS).
  Apply with: `supabase db query --linked -f supabase/migrations/20260716_finetune_studio.sql`

## ⚠️ License (important)

The music model is `Xenova/musicgen-small`, derived from Meta's
[`facebook/musicgen-small`](https://huggingface.co/facebook/musicgen-small),
which is released under **`cc-by-nc-4.0` (non-commercial)**. This demo is for
non-commercial experimentation only. The finetune base models (TinyLlama,
SmolLM2) are **Apache-2.0** and fine for commercial use.

## Dev Diary / Learnings

A running log of non-obvious things learned while building this. Useful when
resuming agentic work on this repo.

- **Server-only music generation.** We dropped the in-browser WASM fallback
  (MusicGen ~656MB) — generation is server-side on Oracle. The worker file
  (`musicgen.worker.ts`) is kept as reference only.
- **Vercel deploys `main`, not PR branches.** Pushes to `feat/*` branches do NOT
  auto-update `https://hello-ai-wheat.vercel.app` unless Vercel is pointed at that
  branch or the PR is merged. The live site reflects the deployed production branch.
- **Docker Compose `.env` injection.** Compose reads `.env` relative to the CWD it
  is launched from. Run `cd ~/backend && docker compose up -d` or the container gets
  empty env (silent Supabase misconfig → 500s). Verified root cause of a `/generate`
  and `/train` 500.
- **Don't `rsync --delete` the VM backend dir.** A `rsync --delete` from a local
  `backend/` (which has no `.env`) **deletes the VM's `~/backend/.env`**, taking down
  Supabase config on next restart. The compose file now hardcodes the env vars
  (see `backend/.env.example`) so reboots/rsyncs can't silently break the backend.
- **`Caddyfile` must stay a file.** After a reboot it appeared as a *directory* on the
  VM, crashing Caddy (`mount ... not a directory`). If Caddy won't start, `rm -rf
  ~/backend/Caddyfile` and recreate it as the file in `backend/docker-compose.yml`.
- **Oracle VM has no GPU.** Training uses CPU PEFT LoRA. Unsloth auto-selected only
  with CUDA; otherwise vanilla `transformers`. Small models + small datasets only.
- **Supabase migration apply:** `supabase db query --linked -f <migration.sql>`.
  (`supabase link --project-ref <ref>` first; CLI v2.109 auto-links via device auth.)
- **Caddy auto-TLS** via Let's Encrypt on the DuckDNS domain; no manual certs.
- **Adapters persist** in a named Docker volume `backend_adapters` mounted at
  `/data/adapters`; the backend also caches adapter files pulled from Supabase.
- **Job status** is the source of truth in Supabase `jobs`; the backend keeps an
  in-memory `loss_log` tail (last 4000 chars) for fast polling.

## Roadmap

- 🔜 Reference-audio **melody conditioning** (upload a clip to guide the melody)
- 🔜 **ACE-Step** local mode (Python/MPS, commercial-friendly)
- 🔜 Optional **GPU shape** on Oracle for faster LoRA training (drop-in: enable Unsloth)
- 🔜 Synthetic dataset generation via a small LLM (currently client-side templates)

