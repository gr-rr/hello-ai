# hello-ai · Music Studio

An in-browser **text-to-music** studio that runs entirely on the client using
[transformers.js](https://github.com/huggingface/transformers.js) and WebGPU.
No server, no API keys — the model runs locally on your GPU.

## Features

- 🎵 **Music Studio** (`/`) — text-to-music with **MusicGen** via transformers.js (WebGPU)
- ⚡ Inference via **transformers.js** (WebGPU): `Xenova/musicgen-small`
- 📊 Live **waveform + spectrogram** visualizer (native Web Audio `AnalyserNode`)

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> Requires a WebGPU-capable browser (recent Chrome/Edge). Without WebGPU the
> model will fail to load.

### Headless WebGPU verification

`npm run debug` drives the live (or local) URL with headless Chromium using
SwiftShader WebGPU and prints console logs. Set `URL` to test another target:

```bash
URL=http://localhost:3000 npm run debug
```

## Deploy

Deploy to [Vercel](https://vercel.com) — connect the repo and it builds with
the included `vercel.json` (Next.js framework preset).

### Environment variables (Vercel + local `.env.local`)

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public, browser-safe) |
| `MUSIC_BACKEND_URL` | Oracle FastAPI backend base URL (e.g. `http://129.146.52.142`) |

Without `MUSIC_BACKEND_URL` the app falls back to in-browser WASM inference.
Without the Supabase vars the gallery is hidden and saving is local-only.

## Server-side generation (Oracle Cloud, always-free)

Generation can also run on an Oracle Cloud **Ampere A1** VM (4 OCPU / 24 GB ARM,
Ubuntu 22.04) instead of — or in addition to — the browser. The Next.js
`/api/generate` route proxies to the backend; the UI auto-falls back to WASM if
the backend is unreachable.

### Architecture

```
Browser ──▶ Vercel (/api/generate) ──▶ Oracle VM
                                     Caddy :80 ──▶ FastAPI :8000 (MusicGen)
                                                  └─▶ Supabase (optional upload)
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
- `main.py` — FastAPI app (`/health`, `/generate`)
- `musicgen_server.py` — MusicGen via `transformers` + `torch` (MPS/CUDA/CPU)
- `requirements.txt`, `Dockerfile`, `docker-compose.yml` (Caddy + backend)

## Persistence (Supabase)

- `lib/supabase.ts` / `lib/db.ts` — client + `saveTrack` / `getTracks`.
- Migration: `supabase/migrations/20260716_init_tracks.sql` (apply via the SQL
  Editor or `supabase db push --linked`).
- Table `public.tracks` + `audio` storage bucket + RLS policies (public read/insert
  for the open demo — tighten with auth later).

## ⚠️ License (important)

The music model is `Xenova/musicgen-small`, derived from Meta's
[`facebook/musicgen-small`](https://huggingface.co/facebook/musicgen-small),
which is released under **`cc-by-nc-4.0` (non-commercial)**. This demo is for
non-commercial experimentation only.

## Roadmap

- 🔜 Reference-audio **melody conditioning** (upload a clip to guide the melody)
- 🔜 Side-by-side **compare** of two generations
- 🔜 **ACE-Step** local mode (Python/MPS, commercial-friendly) + LoRA fine-tuning

