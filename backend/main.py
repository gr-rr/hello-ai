import base64
import contextvars
import json
import logging
import os
import re
import tempfile
import time
import uuid
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from analyze import analyze_audio, analyze_from_midi
from music_features import _sanitize_fmt, enhance_audio, transcribe_audio

_request_id_ctx = contextvars.ContextVar("request_id", default="none")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "req_id": getattr(record, "req_id", "none"),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


_json_handler = logging.StreamHandler()
_json_handler.setFormatter(_JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_json_handler], force=True)
logger = logging.getLogger("backend")

try:
    import sentry_sdk  # noqa: I001
    from sentry_sdk.integrations.starlette import StarletteIntegration  # noqa: I001
    from sentry_sdk.integrations.fastapi import FastAPIIntegration  # noqa: I001

    _sentry_dsn = os.environ.get("SENTRY_DSN_BACKEND") or os.environ.get("SENTRY_DSN")
    if _sentry_dsn:
        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=os.environ.get("SENTRY_ENV", "production"),
            integrations=[StarletteIntegration(), FastAPIIntegration()],
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            send_default_pii=False,
            release=os.environ.get("RELEASE", "backend@0.2.0"),
        )
        logger.info("sentry_initialized")
except ImportError:
    logger.warning("sentry_sdk_not_installed")

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

security = HTTPBearer(auto_error=False)

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", "26214400"))  # 25 MB
_LIBRARY_KEY_RE = re.compile(r"^library/[a-fA-F0-9\-]{32,}/[\w.\-]+$")
_MIDI_KEY_RE = re.compile(r"^midi/[\w.\-]+/[\w.\-]+$")


def _now() -> str:
    return datetime.now(UTC).isoformat()


_ANALYZE_EXTS = {
    "wav": "wav",
    "wave": "wav",
    "mp3": "mp3",
    "flac": "flac",
    "ogg": "ogg",
    "m4a": "m4a",
    "aac": "aac",
}


def _analyze_ext(fmt: str) -> str:
    return _ANALYZE_EXTS.get(fmt.lower(), "wav")


def _valid_library_key(storage_path: str) -> str | None:
    """Return a sanitized storage key inside the `library/` or `midi/` prefix, or None.

    Accepts `library/<uuid>-<name>` (audio) and `midi/<uid>/<name>` (MIDI) and
    rejects any path traversal or attempt to escape the bucket prefix.
    """
    if not storage_path or ".." in storage_path:
        return None
    if _LIBRARY_KEY_RE.match(storage_path):
        return storage_path[len("library/") :]
    if _MIDI_KEY_RE.match(storage_path):
        return storage_path[len("midi/") :]
    return None


_sb_client = None


def _sb():
    global _sb_client
    if _sb_client is not None:
        return _sb_client
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    _sb_client = create_client(url, key)
    return _sb_client


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Auth not configured")
    try:
        user = sb.auth.get_user(token)
        return user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from None


def verify_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    """Like verify_token but allows anonymous access. Returns the user when a
    valid bearer token is supplied, otherwise None. Used by read-only/public
    endpoints (e.g. /music/analyze) so unauthenticated users can still use them."""
    if not credentials:
        return None
    sb = _sb()
    if not sb:
        return None
    try:
        return sb.auth.get_user(credentials.credentials)
    except Exception:
        return None


app = FastAPI(title="hello-ai backend", version="0.3.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    req_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    token = _request_id_ctx.set(req_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed", extra={"req_id": req_id})
        raise
    finally:
        _request_id_ctx.reset(token)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["x-request-id"] = req_id
    logger.info(
        "request_handled",
        extra={
            "req_id": req_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


def _sb_upload(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to a Supabase bucket (service role) and return public URL."""
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Supabase not configured on server")
    sb.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    public = sb.storage.from_(bucket).get_public_url(path)
    return public if isinstance(public, str) else public.get("publicUrl", "")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health(request: Request):
    return {"status": "ok"}


@app.get("/health/live")
def health_live(request: Request):
    return {"status": "alive"}


@app.get("/health/ready")
def health_ready(request: Request):
    sb = _sb()
    st = "ready" if sb else "degraded"
    return {"status": st, "supabase": sb is not None}


# ---------------------------------------------------------------------------
# Music features: library + transcription
# ---------------------------------------------------------------------------
class TranscribeRequest(BaseModel):
    audio_base64: str | None = None
    library_path: str | None = None
    fmt: str = "wav"
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    upload: bool = True


def _load_audio_from_request(
    audio_base64: str | None,
    library_path: str | None,
) -> bytes:
    """Decode base64 audio or download from the library bucket."""
    if audio_base64:
        try:
            audio = base64.b64decode(audio_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail="invalid base64") from e
        if len(audio) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"payload too large (max {MAX_UPLOAD_BYTES} bytes)",
            )
        return audio
    if library_path:
        sb = _sb()
        if not sb:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        key = _valid_library_key(library_path)
        if not key:
            raise HTTPException(status_code=400, detail="invalid library_path")
        bucket = "midi" if library_path.startswith("midi/") else "library"
        try:
            data = sb.storage.from_(bucket).download(key)
        except Exception as e:
            err_msg = str(e)
            err_lower = err_msg.lower()
            if "404" in err_msg or "not_found" in err_lower or "Object not found" in err_msg:
                raise HTTPException(status_code=404, detail="file not found in library") from e
            raise HTTPException(status_code=500, detail="storage error") from e
        return data if isinstance(data, bytes | bytearray) else data.read()
    raise HTTPException(status_code=400, detail="audio_base64 or library_path required")


@app.post("/music/library")
@limiter.limit("10/minute")
async def upload_library(req: dict, request: Request, _auth=Depends(verify_token)):
    """Store a raw audio file in the `library` bucket.

    Body: { name, data_base64, fmt }. Returns { path, url }.
    """
    name = (req.get("name") or f"{uuid.uuid4().hex}").replace("/", "_")
    fmt = _sanitize_fmt(req.get("fmt") or "wav")
    data_b64 = req.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=400, detail="data_base64 required")
    try:
        raw = base64.b64decode(data_b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail="invalid base64") from e
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"payload too large (max {MAX_UPLOAD_BYTES} bytes)",
        )
    ext = fmt.lstrip(".")
    path = f"library/{uuid.uuid4().hex}-{name}.{ext}"
    url = _sb_upload("library", path, raw, f"audio/{ext}")
    return {"path": path, "url": url}


class EnhanceRequest(BaseModel):
    audio_base64: str | None = None
    library_path: str | None = None
    fmt: str = "wav"
    upload: bool = True


@app.post("/music/enhance")
@limiter.limit("20/minute")
def enhance(req: EnhanceRequest, request: Request, _auth=Depends(verify_token_optional)):
    """Cleanup a raw recording (denoise/declip/normalize) via ffmpeg."""
    audio = _load_audio_from_request(req.audio_base64, req.library_path)

    try:
        cleaned = enhance_audio(audio, fmt=req.fmt)
    except Exception as e:
        logger.exception("enhance failed")
        raise HTTPException(status_code=500, detail="enhance failed") from e

    out = {"wav_base64": base64.b64encode(cleaned).decode("ascii")}
    if req.upload:
        path = f"library/{uuid.uuid4().hex}-enhanced.wav"
        out["url"] = _sb_upload("library", path, cleaned, "audio/wav")
    return out


@app.post("/music/transcribe")
@limiter.limit("10/minute")
def transcribe(req: TranscribeRequest, request: Request, _auth=Depends(verify_token_optional)):
    """Transcribe audio -> MIDI (+ synthesized WAV + note events)."""
    audio = _load_audio_from_request(req.audio_base64, req.library_path)

    try:
        result = transcribe_audio(
            audio,
            fmt=req.fmt,
            onset_threshold=req.onset_threshold,
            frame_threshold=req.frame_threshold,
        )
    except Exception as e:
        logger.exception("transcription failed")
        raise HTTPException(status_code=500, detail="transcription failed") from e

    midi = result["midi"]
    wav = result["wav"]
    out = {
        "notes": result["notes"],
        "num_notes": result["num_notes"],
        "midi_base64": base64.b64encode(midi).decode("ascii"),
        "wav_base64": base64.b64encode(wav).decode("ascii"),
    }
    if req.upload:
        midi_path = f"midi/backend/{uuid.uuid4().hex}.mid"
        wav_path = f"midi/backend/{uuid.uuid4().hex}.wav"
        out["midi_url"] = _sb_upload("midi", midi_path, midi, "audio/midi")
        out["wav_url"] = _sb_upload("midi", wav_path, wav, "audio/wav")
    return out


class AnalyzeRequest(BaseModel):
    audio_base64: str | None = None
    midi_base64: str | None = None
    library_path: str | None = None
    fmt: str = "wav"


@app.post("/music/analyze")
@limiter.limit("30/minute")
def analyze(req: AnalyzeRequest, request: Request, _auth=Depends(verify_token_optional)):
    """Analyze audio (or MIDI) for key, tempo, time signature, and chords."""
    has_audio = bool(req.audio_base64)
    has_midi = bool(req.midi_base64)
    has_library = bool(req.library_path)
    if not (has_audio or has_midi or has_library):
        raise HTTPException(
            status_code=422,
            detail="audio_base64, midi_base64, or library_path required",
        )

    with tempfile.TemporaryDirectory() as td:
        audio_path = None
        midi_path = None

        if has_audio:
            try:
                audio_bytes = base64.b64decode(req.audio_base64, validate=True)
            except Exception:
                raise HTTPException(status_code=400, detail="invalid audio base64") from None
            if len(audio_bytes) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"payload too large (max {MAX_UPLOAD_BYTES} bytes)",
                )
            ext = _analyze_ext(req.fmt)
            audio_path = os.path.join(td, f"input.{ext}")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

        if has_midi:
            try:
                midi_bytes = base64.b64decode(req.midi_base64, validate=True)
            except Exception:
                raise HTTPException(status_code=400, detail="invalid midi base64") from None
            if len(midi_bytes) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"payload too large (max {MAX_UPLOAD_BYTES} bytes)",
                )
            midi_path = os.path.join(td, "input.mid")
            with open(midi_path, "wb") as f:
                f.write(midi_bytes)

        if has_library:
            sb = _sb()
            if not sb:
                raise HTTPException(status_code=500, detail="Supabase not configured")
            key = _valid_library_key(req.library_path)
            if not key:
                raise HTTPException(status_code=400, detail="invalid library_path")
            bucket = "midi" if req.library_path.startswith("midi/") else "library"
            try:
                data = sb.storage.from_(bucket).download(key)
            except Exception as e:
                err_msg = str(e)
                err_lower = err_msg.lower()
                if "404" in err_msg or "not_found" in err_lower or "Object not found" in err_msg:
                    raise HTTPException(status_code=404, detail="file not found in library") from e
                raise HTTPException(status_code=500, detail="storage error") from e
            raw = data if isinstance(data, bytes | bytearray) else data.read()
            if req.library_path.endswith(".mid") or bucket == "midi":
                midi_path = os.path.join(td, "input.mid")
                with open(midi_path, "wb") as f:
                    f.write(raw)
            else:
                ext = _analyze_ext(req.fmt)
                audio_path = os.path.join(td, f"input.{ext}")
                with open(audio_path, "wb") as f:
                    f.write(raw)

        try:
            if audio_path:
                result = analyze_audio(audio_path, midi_path)
            else:
                result = analyze_from_midi(midi_path)
        except Exception:
            logger.exception("analysis failed")
            raise HTTPException(status_code=500, detail="analysis failed") from None

    return result


@app.delete("/music/library/transcription/{record_id:path}")
@limiter.limit("30/minute")
def delete_transcription(record_id: str, request: Request, auth=Depends(verify_token)):
    """Delete a saved transcription from the `transcriptions` bucket."""
    segments = record_id.split("/")
    if len(segments) < 2 or segments[0] != "transcriptions":
        raise HTTPException(status_code=400, detail="invalid path")
    user_id = segments[1]
    authed_user_id = getattr(auth.user, "id", None)
    if user_id != authed_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    key = record_id.replace("transcriptions/", "", 1)
    sb.storage.from_("transcriptions").remove([key])
    return {"status": "deleted"}


@app.delete("/music/library/{path:path}")
@limiter.limit("30/minute")
def delete_library_file(path: str, request: Request, auth=Depends(verify_token)):
    """Delete a file from the `library` bucket using the service role key."""
    segments = path.split("/")
    if len(segments) < 2 or segments[0] != "library":
        raise HTTPException(status_code=400, detail="invalid path")
    user_id = segments[1]
    authed_user_id = getattr(auth.user, "id", None)
    if user_id != authed_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    key = path.replace("library/", "", 1)
    sb.storage.from_("library").remove([key])
    return {"status": "deleted"}
