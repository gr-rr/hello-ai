# hello-ai API Reference

This document describes all FastAPI endpoints in the `/api/*` route handlers. All endpoints require authentication unless explicitly marked as public. The frontend proxies all API calls through `lib/backend.ts` (`proxyToBackend`).

## Table of Contents

1. [Music Processing](#music-processing)
   - [`/music/transcribe`](#musictranscribe)
   - [`/music/enhance`](#musicenhance)
   - [`/music/analyze`](#musicanalyze)
   - [`/music/library`](#musiclibrary)
2. [Storage Management](#storage-management)
   - [`/music/library/{path}`](#musiclibrarypath)
   - [`/music/library/transcription/{record_id}`](#musiclibrarytranscriptionrecord_id)
3. [Backend Health](#backend-health)
   - [`/health`](#health)
   - [`/health/live`](#healthlive)
   - [`/health/ready`](#healthready)

## Music Processing

### `/music/transcribe`

**POST** `/music/transcribe`

Transcribe audio → MIDI + WAV + note events. Stores results in Supabase `midi` + `audio` buckets when `upload=true`.

#### Authentication
Required: `verify_token` middleware (service-role auth)

#### Rate Limit
20 requests per minute

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
Required: `verify_token` middleware

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
Required: `verify_token` middleware

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

#### Response

```json
{
  "status": "deleted"
}
```

---

### `/music/library/transcription/{record_id:path}`

**DELETE** `/music/library/transcription/{record_id:path}`

Delete a saved transcription from the `transcriptions` bucket. Admin functionality.

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

## Local Development

For local testing with the real backend:

```bash
# Inside backend/
docker compose up -d  # Starts FastAPI + Caddy

# Check status
curl http://localhost:8000/health
```

The frontend proxies to `MUSIC_BACKEND_URL` (default `https://gricci-testing.duckdns.org:8000`).
