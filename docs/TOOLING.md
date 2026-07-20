# Tooling Reference

| Tool | What it does | Config |
|------|-------------|--------|
| **Next.js** | React framework (SSR, RSC, route handlers) | `next.config.mjs`, `tsconfig.json` |
| **TypeScript** | Type checking | `tsconfig.json` |
| **Playwright** | E2E + visual regression tests | `playwright.config.ts` |
| **Argos** | Visual diff (screenshots vs baseline) | `.github/workflows/argos.yml` |
| **Supabase** | Storage + DB (browser-side anon key) | `lib/supabase.ts` |
| **FastAPI** | Backend audio processing (Oracle VM) | `backend/` |
| **abcjs** | Sheet-music rendering dependency (retained for a planned score feature; `app/layout.tsx` imports `abcjs/abcjs-audio.css`) | `app/layout.tsx` |
| **basic-pitch** | WAV → MIDI transcription (backend) | `backend/music_features.py` |
| **FluidSynth** | MIDI → WAV synthesis (backend) | `backend/music_features.py` |
| **Vercel** | Hosting + CI (build + deploy) | Project linked to GitHub |
| **npm** | Package management | `package.json` |
