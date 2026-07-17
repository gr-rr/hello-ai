# Tooling & Libraries

What the project uses, and why. Versions are pinned in `package.json`.

## Runtime dependencies
| Library | Role | License | Notes |
|---------|------|---------|-------|
| `next` (15) | React framework, App Router, API routes, SSR | MIT | Public edge (Vercel) |
| `react` / `react-dom` (19) | UI | MIT | |
| `@supabase/supabase-js` | Browser client for Supabase storage/DB | MIT | Anon key; graceful fallback if unconfigured |
| `abcjs` (6) | Renders ABC notation to SVG + Web Audio synth | MIT | Sheet music in `components/Score.tsx` |
| `@huggingface/transformers` | In-browser LLM inference (WebGPU) | Apache-2.0 | Used by Chat (disabled) |

## Dev / test tooling
| Tool | Role |
|------|------|
| `typescript` | Type safety |
| `@playwright/test` + `playwright` | E2E + visual tests (`tests/e2e`, `tests/visual`) |
| `@argos-ci/playwright` | Argos reporter for visual regression diffs |
| `tailwindcss` (4) + `@tailwindcss/postcss` | Utility/CSS pipeline (v4, CSS-first config) |
| `@types/node`, `@types/react`, `@types/react-dom` | Types |

## Backend (Python, Oracle VM — separate deploy)
| Library | Role |
|---------|------|
| `fastapi` + `uvicorn` | HTTP API |
| `torch` + `transformers` | MusicGen / LoRA finetune |
| `basic-pitch` | Audio → MIDI transcription (Apache-2.0) |
| `pretty_midi` / `soundfile` | MIDI handling |
| `pyfluidsynth` | MIDI → WAV synthesis (FluidR3_GM soundfont) |
| `ffmpeg` (system) | Audio enhance/normalize |
| `peft` + `datasets` | LoRA finetuning |
| `supabase` (py) | Server-side storage (service-role key) |

## External services
| Service | Use | Cost |
|---------|-----|------|
| Vercel | Host Next.js app | Free (hobby) |
| Oracle Cloud | VM for FastAPI backend | Free (always-free ARM) |
| Supabase | Postgres + Storage | Free tier |
| Argos | Visual regression | Free (OSS plan) |
| GitHub Actions | CI | Free (public repo) |
| duckdns | Free subdomain for the VM | Free |

## Project config files
| File | Purpose |
|------|---------|
| `next.config.mjs` | Next config (webpack alias `onnxruntime-node$ → false` for browser build) |
| `tailwind` (via `globals.css` + `postcss.config.mjs`) | Styling |
| `playwright.config.ts` | Test runner (`testDir: ./tests`) |
| `.github/workflows/build.yml` | Required CI gate (build + E2E journeys) |
| `.github/workflows/argos.yml` | Visual QA (non-blocking) |
| `vercel.json` | Vercel deploy settings |
| `.vercelignore` | Excludes `backend/`, `soundfonts/`, `.env.local` from Vercel |
| `tsconfig.json` | `@/*` path alias → repo root |
| `design/tokens.json` | Design token source of truth |

## Design system
- Tokens: `design/tokens.json` → mirrored in `app/globals.css :root`.
- Primitives (hand-rolled, no UI lib): `.btn`, `.btn-primary`, `.chip`,
  `.panel-box`, `.surface-card`, `.input`, `.muted`, plus feature classes
  (`.score`, `.piano-app`, `.card`, `.tab`, ...).
- **No component library** (shadcn scaffolding was removed during cleanup). Add
  primitives to `globals.css` using tokens; don't hard-code colors/spacing.

## Notes
- `Geist` font is loaded via `next/font/google` (built into Next) — not a
  dependency.
- The abcjs soundfont is loaded from `https://paulrosen.github.io/midi-js-soundfonts/`
  at runtime (configured in `components/Score.tsx`).
- The backend URL default is `https://gricci-testing.duckdns.org` (override via
  `MUSIC_BACKEND_URL`).
