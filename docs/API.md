# hello-ai API Reference

This document describes all FastAPI endpoints in the `/api/*` route handlers. Most endpoints require authentication. `/music/transcribe`, `/music/enhance`, and `/music/analyze` use `verify_token_optional` so the Studio works without sign-in; all other routes require `verify_token`. The frontend proxies all API calls through `lib/backend.ts` (`proxyToBackend`).

## Table of Contents

1. [Music Processing](#music-processing)
   - [`/music/transcribe`](#musictranscribe)
   - [`/music/enhance`](#musicenhence)
   - [`/music/analyze`](#musicanalyze)
   - [`/music/library`](#musiclibrary)
2. [Storage Management](#storage-management)
   - [`/music/library/{path}`](#musiclibrarypath)
   - [`/music/library/transcription/{record_id}`](#musiclibrarytranscriptionrecord_id)
3. [Backend Health](#backend-health)
   - [`/health`](#health)
   - [`/health/live`](#healthlive)
   - [`/health/ready`](#healthready)
4. [Finetune Studio](#finetune-studio)
   - [`/train`](#train)
   - [`/models`](#models)
   - [`/models/base`](#modelsbase)
   - [`/jobs/{job_id}`](#jobsjob_id)
   - [`/compare`](#compare)
   - [`/generate`](#generate)

## Music Processing

### `/music/transcribe`

**POST** `/music/transcribe`

Transcribe audio → MIDI + WAV + note events. Stores results in Supabase `midi` + `audio` buckets when `upload=true`.

#### Authentication
Optional: `verify_token_optional` (anonymous requests allowed)

#### Rate Limit
10 requests per minute

#### Request Body

```json
{
  "audio_base64": "base64-encoded-wav-file-or-null",
  "library_path": "library/<uuid>-filename.wav-or-null",
  "fmt": "wav",
  "onset_threshold": 0.5,
  "frame_threshold": 0.3,
  "upload": true
}
```

**One of `audio_base64` or `library_path` must be provided.

#### Response

```json
{
  "notes": [
    {
      "pitch": 69,
      "start": 0.5,
      "end": 1.2,
      "velocity": 100
    }
  ],
  "num_notes": 120,
  "midi_base64": "base64-encoded-midi-bytes",
  "wav_base64": "base64-encoded-wav-bytes",
  "midi_url": "https://.../midi/<uuid>.mid",  // if upload=true
  "wav_url": "https://.../midi/<uuid>.wav"   // if upload=true
}
```

#### Security
- Upload size: `MAX_UPLOAD_BYTES` (25 MB) enforced via `413`
- Library path: validates via `_valid_library_key()` to prevent path traversal
- Format: sanitized via `_sanitize_fmt()`

#### Error Codes

| Code | Condition |
|------|-----------|
| 400 | Invalid base64 or missing audio source |
| 404 | Supabase not configured |
| 413 | Payload exceeds 25 MB |
| 500 | Unexpected error (generic message, logged internally) |

---

### `/music/enhance`

**POST** `/music/enhance`

Lightweight audio cleanup: denoise (afftdn), declip (adeclip), EBU R128 normalize. Runs transparently before transcription.

#### Authentication
Optional: `verify_token_optional` (anonymous requests allowed)

#### Rate Limit
20 requests per minute

#### Request Body

```json
{
  "audio_base64": "base64-encoded-audio-or-null",
  "library_path": "library/<uuid>-filename.wav-or-null",
  "fmt": "wav",
  "upload": true
}
```

#### Response

```json
{
  "wav_base64": "base64-encoded-cleaned-wav-bytes",
  "url": "https://.../library/<uuid>-enhanced.wav"  // if upload=true
}
```

#### Security
- Upload size: `MAX_UPLOAD_BYTES` (25 MB)
- All subprocess calls have 120-second timeout via `subprocess.run(timeout=120)`

---

### `/music/analyze`

**POST** `/music/analyze`

Analyze audio for key/tempo/time-signature/chords using librosa on the Oracle backend.

#### Authentication
Optional: `verify_token_optional` (anonymous requests allowed)

#### Rate Limit
30 requests per minute

#### Request Body

```json
{
  "audio_base64": "base64-encoded-audio-or-null",
  "library_path": "library/<uuid>-filename.wav-or-null",
  "fmt": "wav"
}
```

#### Response

```json
{
  "key": {
    "tonic": "C",
    "mode": "major",
    "confidence": 0.923
  },
  "tempo": {
    "bpm": 120.5,
    "confidence": 0.841
  },
  "time_signature": {
    "numerator": 4,
    "denominator": 4,
    "confidence": 0.723
  },
  "chords": [
    {
      "root": "C",
      "quality": "M",
      "start": 0.0,
      "end": 4.2
    }
  ]
}
```

---

### `/music/library`

**POST** `/music/library`

Store a raw audio file in the `library` bucket. Used by Library tab uploads.

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
10 requests per minute

#### Request Body

```json
{
  "name": "my-song.wav",
  "data_base64": "base64-encoded-audio-file",
  "fmt": "wav"
}
```

#### Response

```json
{
  "path": "library/<uuid>-my-song.wav",
  "url": "https://.../library/<uuid>-my-song.wav"
}
```

#### Security
- Upload size: `MAX_UPLOAD_BYTES` (25 MB)
- Name sanitized to remove path separators (`/` → `_`)
- Format validated via `_sanitize_fmt()`

---

## Storage Management

### `/music/library/{path}`

**DELETE** `/music/library/{path:path}`

Delete a file from the `library` bucket. User owns the path (authorization check).

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
30 requests per minute

#### Path Parameter

`{path}` - Storage key like `library/<user-uuid>-filename.wav`

#### Authorization
- User ID must match the authenticated user
- Path must start with `library/`

> Note: path validation currently re-implements the check with `path.split("/")` + the discouraged `path.replace("library/", "", 1)` rather than `_valid_library_key()`. Prefer the safe helper to avoid traversal.

#### Response

```json
{
  "status": "deleted"
}
```

---

### `/music/library/transcription/{record_id:path}`

**DELETE** `/music/library/transcription/{record_id:path}`

Delete a saved transcription from the `transcriptions` bucket. Requires any authenticated user (no admin distinction).

> Known gaps (see `docs/audits/CODE_REVIEW.md` P1-5): this route performs **no ownership check** (IDOR — any authenticated user can delete any transcription), and it is currently **unreachable** because the greedy `/music/library/{path:path}` route is registered first and matches `/music/library/transcription/*` (its `segments[0] != "library"` → `400`).

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
30 requests per minute

#### Path Parameter

`{record_id}` - Supabase storage object path

#### Response

```json
{
  "status": "deleted"
}
```

---

## Backend Health

All health endpoints are public (no auth required). Used by CI/CD and monitoring.

### `/health`

**GET** `/health`

Basic liveness check.

```json
{
  "status": "ok"
}
```

### `/health/live`

**GET** `/health/live`

Full liveness check.

```json
{
  "status": "alive"
}
```

### `/health/ready`

**GET** `/health/ready`

Readiness check includes Supabase connectivity.

```json
{
  "status": "ready",  // or "degraded" if Supabase missing
  "supabase": true    // or false
}
```

---

## Finetune Studio

All finetune endpoints require authentication and rate limits enforced per operation.

### `/train`

**POST** `/train`

Start a LoRA fine-tuning job on the Oracle VM.

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
1 request per minute

#### Request Body

```json
{
  "base_model": "Xenova/musicgen-small",
  "dataset_text": "...JSONL...",  // OR
  "dataset_path": "datasets/user1.jsonl",  // OR
  "name": "My Music Model",
  "lora_r": 16,
  "lora_alpha": 32,
  "epochs": 3.0,
  "learning_rate": 2e-4,
  "batch_size": 4,
  "max_seq_len": 1024
}
```

#### Response

```json
{
  "job_id": "uuid-hex",
  "status": "queued"
}
```

#### Special Notes

- Single-slot guard: only one training run at a time
- `DISABLE_TRAINING=true` environment variable turns off entirely
- Job status tracked via `/jobs/{job_id}`

---

### `/models`

**GET** `/models`

List all user LoRA models.

#### Authentication
Required: `verify_token` middleware

#### Response

```json
{
  "models": [
    {
      "id": "uuid-hex",
      "name": "My Music Model",
      "base_model": "Xenova/musicgen-small",
      "job_id": "uuid-hex",
      "adapter_path": "adapters/<id>/",
      "created_at": "2026-07-19T02:19:00.123Z"
    }
  ]
}
```

---

### `/models/base`

**GET** `/models/base`

List available base models for fine-tuning.

#### Authentication
Required: `verify_token` middleware

#### Response

```json
{
  "models": [
    "Xenova/musicgen-small",
    "stabilityai/stable-audio",
    ...
  ]
}
```

---

### `/jobs/{job_id}`

**GET** `/jobs/{job_id}`

Get training job status and logs.

#### Authentication
Required: `verify_token` middleware

#### Response

```json
{
  "id": "uuid-hex",
  "status": "running",  // running, done, error, queued
  "base_model": "Xenova/musicgen-small",
  "params": {...},
  "dataset_path": "datasets/user.jsonl",
  "loss_log": "...log...".
  "error": "...error-message...",  // present on error
  "finished_at": "2026-07-19T02:19:00.123Z"  // present when done
}
```

---

### `/compare`

**POST** `/compare`

Compare two model versions (base vs adapter) using the same prompt.

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
5 requests per minute

#### Request Body

```json
{
  "prompt": "play a jazz chord progression",
  "model_a": "base",  // or specific model UUID
  "model_b": "base",
  "base_model": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  "max_new_tokens": 128,
  "temperature": 0.7
}
```

#### Response

```json
{
  "prompt": "play a jazz chord progression",
  "a": "...model A output...",
  "b": "...model B output..."
}
```

---

### `/generate`

**POST** `/generate`

Generate audio using a text-to-music model (MusicGen).

#### Authentication
Required: `verify_token` middleware

#### Rate Limit
5 requests per minute

#### Request Body

```json
{
  "prompt": "upbeat piano pop song",
  "duration": 5,
  "guidance_scale": 3.0,
  "temperature": 1.0,
  "model": "Xenova/musicgen-small",
  "upload": true
}
```

#### Response

```json
{
  "audio_base64": "base64-encoded-wav-bytes",  // if upload=false
  "audio_url": "https://.../audio/tracks/<uuid>.wav",  // if upload=true (bucket: `audio`)
  "format": "wav",
  "duration": 5
}
```

#### Special Notes

- Falls back to numpy synth if FluidSynth unavailable
- Server-side upload uses SERVICE_ROLE key (never exposed to browser)
- 120-second subprocess timeout

---

## Security Checklist for New API Endpoints

All new or modified API endpoints MUST satisfy all of the following:

1. **Upload size validation** — check base64 audio before processing (max 25 MB, return `413`)
2. **Storage path validation** — any user `library_path` must pass through `_valid_library_key()`  
3. **Format sanitization** — any user `fmt` must pass through `_sanitize_fmt()` before building paths
4. **Subprocess timeouts** — every `subprocess.run` (ffmpeg, etc.) MUST set `timeout=` to prevent hangs
5. **No error leakage** — 5xx `detail` messages MUST NOT include raw exception text
6. **Timestamps** — use `_now()` for UTC ISO strings, never the literal `"now()"`
7. **Auth** — every state-changing route MUST depend on `verify_token`

## Error Response Format

```json
{
  "detail": "Error description"  // Generic message, no internal details
}
```

Bad Request (400), Unauthorized (401), Forbidden (403), Not Found (404), Too Many Requests (429), Too Large (413), Server Error (500)

---

## Backend Configuration

Environment variables needed on Oracle VM:

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT (secret) |
| `SOUNDFONT_PATH` | Path to FluidR3_GM.sf2 (default `/app/soundfonts/FluidR3_GM.sf2`) |
| `MAX_UPLOAD_BYTES` | Upload size limit (default 26214400 = 25 MB) |
| `DISABLE_TRAINING` | Set to `true` to disable all training endpoints |
| `ADAPTER_ROOT` | Local adapter cache (default `/data/adapters`) |

## Local Development

For local testing with the real backend:

```bash
# Inside backend/
docker compose up -d  # Starts FastAPI + Caddy

# Check status
curl http://localhost:8000/health
```

The frontend proxies to `MUSIC_BACKEND_URL` (default `https://gricci-testing.duckdns.org:8000`).
