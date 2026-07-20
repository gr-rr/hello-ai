import base64
import logging
import os
import re
import tempfile
import threading
import uuid
from datetime import UTC, datetime

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from analyze import analyze_from_midi
from finetune_server import (
    generate as ft_generate,
)
from finetune_server import (
    list_base_models,
    load_dataset_jsonl,
    train_lora,
)
from music_features import _sanitize_fmt, enhance_audio, transcribe_audio
from musicgen_server import generate_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

security = HTTPBearer(auto_error=False)

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", "26214400"))  # 25 MB
_LIBRARY_KEY_RE = re.compile(r"^library/[0-9a-f]{32}-[\w.\-]+$")


def _now() -> str:
    """Current UTC time as an ISO-8601 string (no timezone naive literals)."""
    return datetime.now(UTC).isoformat()


def _decode_base64_guarded(data_b64: str, limit: int = MAX_UPLOAD_BYTES) -> bytes:
    """Decode base64 audio, rejecting malformed input (400) or oversized
    payloads (413) before any further processing."""
    try:
        raw = base64.b64decode(data_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid base64") from None
    if len(raw) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"payload too large (max {limit} bytes)",
        )
    return raw


def _valid_library_key(library_path: str) -> str | None:
    """Return a sanitized storage key inside the `library/` prefix, or None.

    Only accepts keys shaped like `library/<uuid>-<name>` and rejects any path
    traversal or attempt to escape the bucket prefix.
    """
    if not library_path:
        return None
    key = library_path[len("library/") :] if library_path.startswith("library/") else library_path
    candidate = f"library/{key}"
    return candidate if _LIBRARY_KEY_RE.match(candidate) else None


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


app = FastAPI(title="hello-ai backend", version="0.2.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Local cache for trained adapters (persisted on the VM volume).
ADAPTER_ROOT = os.environ.get("ADAPTER_ROOT", "/data/adapters")
os.makedirs(ADAPTER_ROOT, exist_ok=True)

# In-memory job status (mirrors Supabase jobs row; Supabase is source of truth
# when configured, this is the fallback for quick status updates).
_job_logs: dict[str, str] = {}
_job_lock = threading.Lock()
# Single-slot training guard: only one training run at a time on the CPU VM.
_training_slot = threading.Lock()


class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 5
    guidance_scale: float = 3.0
    temperature: float = 1.0
    model: str = "Xenova/musicgen-small"
    # If true, upload to Supabase Storage and return a public URL instead of base64.
    upload: bool = False


class GenerateResponse(BaseModel):
    audio_base64: str | None = None
    audio_url: str | None = None
    format: str = "wav"
    duration: int


@app.get("/health")
def health(request: Request):
    return {"status": "ok"}


@app.get("/health/live")
def health_live(request: Request):
    return {"status": "alive"}


@app.get("/health/ready")
def health_ready(request: Request):
    sb = _sb()
    status = "ready" if sb else "degraded"
    return {"status": status, "supabase": sb is not None}


# ---------------------------------------------------------------------------
# Finetune studio
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    base_model: str
    dataset_text: str | None = None  # raw JSONL
    dataset_path: str | None = None  # path in Supabase 'datasets' bucket
    name: str | None = None
    lora_r: int = 16
    lora_alpha: int = 32
    epochs: float = 3.0
    learning_rate: float = 2e-4
    max_seq_len: int | None = None
    batch_size: int = 4


class CompareRequest(BaseModel):
    prompt: str
    model_a: str = "base"  # "base" or a models.id
    model_b: str = "base"
    base_model: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    max_new_tokens: int = 128
    temperature: float = 0.7


class TranscribeRequest(BaseModel):
    # Raw audio as base64 (browser upload) OR a path in the `library` bucket.
    audio_base64: str | None = None
    library_path: str | None = None
    fmt: str = "wav"
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    upload: bool = True  # store midi + wav to Supabase


def _sb():
    """Lazily build a Supabase client from env, or None when unconfigured."""
    import os

    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def _append_log(job_id: str, msg: str):
    """Append a line to the in-memory job log (capped) and mirror it to the
    Supabase `jobs.loss_log` column when storage is configured."""
    with _job_lock:
        _job_logs[job_id] = (_job_logs.get(job_id, "") + msg + "\n").strip()[-4000:]
    sb = _sb()
    if sb:
        sb.table("jobs").update({"loss_log": _job_logs[job_id]}).eq("id", job_id).execute()


def _run_training(job_id: str, req: TrainRequest):
    sb = _sb()
    if sb:
        sb.table("jobs").update({"status": "running"}).eq("id", job_id).execute()
    try:
        with _training_slot:
            # Resolve dataset text.
            if req.dataset_text:
                text = req.dataset_text
            elif req.dataset_path:
                sb2 = _sb()
                if not sb2:
                    raise RuntimeError("Supabase not configured for dataset fetch")
                data = sb2.storage.from_("datasets").download(req.dataset_path)
                text = data.decode("utf-8") if isinstance(data, bytes | bytearray) else data
            else:
                raise ValueError("no dataset provided")

            rows = load_dataset_jsonl(text)

            adapter_dir = os.path.join(ADAPTER_ROOT, job_id)
            params = {
                "lora_r": req.lora_r,
                "lora_alpha": req.lora_alpha,
                "epochs": req.epochs,
                "learning_rate": req.learning_rate,
                "max_seq_len": req.max_seq_len or 1024,
                "batch_size": req.batch_size,
            }
            train_lora(req.base_model, rows, params, adapter_dir, lambda m: _append_log(job_id, m))

            # Persist adapter to Supabase if configured.
            adapter_path = f"adapters/{job_id}"
            sb3 = _sb()
            if sb3:
                for fname in os.listdir(adapter_dir):
                    with open(os.path.join(adapter_dir, fname), "rb") as f:
                        sb3.storage.from_("adapters").upload(
                            f"{job_id}/{fname}",
                            f.read(),
                            file_options={"content-type": "application/octet-stream"},
                        )
                sb3.table("models").insert(
                    {
                        "name": req.name or f"{req.base_model.split('/')[-1]} LoRA",
                        "base_model": req.base_model,
                        "job_id": job_id,
                        "adapter_path": adapter_path,
                    }
                ).execute()

            if sb:
                sb.table("jobs").update(
                    {
                        "status": "done",
                        "finished_at": _now(),
                        "loss_log": _job_logs.get(job_id, ""),
                    }
                ).eq("id", job_id).execute()
            _append_log(job_id, "DONE")
    except Exception as e:
        logger.exception("training failed")
        _append_log(job_id, f"ERROR: {e}")
        if sb:
            sb.table("jobs").update(
                {
                    "status": "error",
                    "error": str(e),
                    "finished_at": _now(),
                }
            ).eq("id", job_id).execute()


@app.get("/models/base")
def models_base(_auth=Depends(verify_token)):
    return {"models": list_base_models()}


@app.post("/train")
@limiter.limit("1/minute")
def train(
    req: TrainRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    _auth=Depends(verify_token),
):
    # Hard kill-switch (set DISABLE_TRAINING=true to turn training off entirely).
    if os.environ.get("DISABLE_TRAINING", "false").lower() == "true":
        raise HTTPException(status_code=503, detail="training is disabled")
    # Single-slot guard: only one training run at a time on the CPU-only VM.
    if not _training_slot.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="a training job is already running — wait for it to finish",
        )
    _training_slot.release()  # _run_training re-acquires it for the actual run.
    if not req.dataset_text and not req.dataset_path:
        raise HTTPException(status_code=400, detail="dataset_text or dataset_path required")
    job_id = uuid.uuid4().hex
    params = {
        "lora_r": req.lora_r,
        "lora_alpha": req.lora_alpha,
        "epochs": req.epochs,
        "learning_rate": req.learning_rate,
        "max_seq_len": req.max_seq_len or 1024,
        "batch_size": req.batch_size,
        "name": req.name,
    }
    sb = _sb()
    if sb:
        sb.table("jobs").insert(
            {
                "id": job_id,
                "base_model": req.base_model,
                "params": params,
                "dataset_path": req.dataset_path,
                "status": "queued",
            }
        ).execute()
    _job_logs[job_id] = "queued"
    background_tasks.add_task(_run_training, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def job_status(job_id: str, _auth=Depends(verify_token)):
    sb = _sb()
    if sb:
        res = sb.table("jobs").select("*").eq("id", job_id).execute()
        if res.data:
            row = res.data[0]
            row["loss_log"] = _job_logs.get(job_id, row.get("loss_log", ""))
            return row
    with _job_lock:
        log = _job_logs.get(job_id)
    if not log:
        raise HTTPException(status_code=404, detail="job not found")
    return {"id": job_id, "status": "running", "loss_log": log}


@app.get("/models")
def list_models(_auth=Depends(verify_token)):
    sb = _sb()
    if not sb:
        return {"models": []}
    res = sb.table("models").select("*").order("created_at", desc=True).execute()
    return {"models": res.data or []}


def _resolve_adapter(model_ref: str, base_model: str):
    """Return (base_model, adapter_dir_or_None) for a model reference."""
    if model_ref in ("base", "", None):
        return base_model, None
    sb = _sb()
    if sb:
        res = sb.table("models").select("*").eq("id", model_ref).execute()
        if res.data:
            m = res.data[0]
            adapter_dir = os.path.join(ADAPTER_ROOT, m["id"])
            # Pull adapter files from Supabase if not cached locally.
            if not os.path.isdir(adapter_dir):
                files = sb.storage.from_("adapters").list(m["id"])
                if files:
                    os.makedirs(adapter_dir, exist_ok=True)
                    for f in files:
                        data = sb.storage.from_("adapters").download(f"{m['id']}/{f['name']}")
                        with open(os.path.join(adapter_dir, f["name"]), "wb") as fh:
                            fh.write(data if isinstance(data, bytes | bytearray) else data.read())
            return m["base_model"], (adapter_dir if os.path.isdir(adapter_dir) else None)
    return base_model, None


@app.post("/compare")
@limiter.limit("5/minute")
def compare(req: CompareRequest, request: Request, _auth=Depends(verify_token)):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    base_a, ad_a = _resolve_adapter(req.model_a, req.base_model)
    base_b, ad_b = _resolve_adapter(req.model_b, req.base_model)
    try:
        a_text = ft_generate(base_a, ad_a, req.prompt, req.max_new_tokens, req.temperature)
        b_text = ft_generate(base_b, ad_b, req.prompt, req.max_new_tokens, req.temperature)
    except Exception as e:
        logger.exception("compare failed")
        raise HTTPException(status_code=500, detail="compare failed") from e
    return {"prompt": req.prompt, "a": a_text, "b": b_text}


@app.post("/generate", response_model=GenerateResponse)
@limiter.limit("5/minute")
def generate(req: GenerateRequest, request: Request, _auth=Depends(verify_token)):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    logger.info(
        "generating: %s (%.1fs, g=%.1f, t=%.1f)",
        req.prompt,
        req.duration,
        req.guidance_scale,
        req.temperature,
    )

    try:
        wav_bytes = generate_audio(
            prompt=req.prompt.strip(),
            duration=req.duration,
            guidance_scale=req.guidance_scale,
            temperature=req.temperature,
            model=req.model,
        )
    except Exception as e:
        logger.exception("generation failed")
        raise HTTPException(status_code=500, detail="generation failed") from e

    if req.upload:
        url = _upload_to_supabase(wav_bytes, req)
        return GenerateResponse(audio_url=url, duration=req.duration)

    b64 = base64.b64encode(wav_bytes).decode("ascii")
    return GenerateResponse(audio_base64=b64, duration=req.duration)


def _upload_to_supabase(wav_bytes: bytes, req: GenerateRequest) -> str:
    # Server-side upload using the service-role key (kept on the server, never the browser).
    import os

    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase not configured on server")

    sb = create_client(url, key)
    path = f"tracks/{uuid.uuid4().hex}.wav"
    sb.storage.from_("audio").upload(path, wav_bytes, {"content-type": "audio/wav"})
    # Insert metadata row.
    sb.table("tracks").insert(
        {
            "prompt": req.prompt.strip(),
            "model": req.model,
            "duration": req.duration,
            "guidance_scale": req.guidance_scale,
            "temperature": req.temperature,
            "audio_path": path,
        }
    ).execute()
    public = sb.storage.from_("audio").get_public_url(path)
    return public if isinstance(public, str) else public.get("publicUrl", "")


def _sb_upload(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to a Supabase bucket (service role) and return public URL."""
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Supabase not configured on server")
    sb.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    public = sb.storage.from_(bucket).get_public_url(path)
    return public if isinstance(public, str) else public.get("publicUrl", "")


# ---------------------------------------------------------------------------
# Music features: library + transcription
# ---------------------------------------------------------------------------
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
    raw = _decode_base64_guarded(data_b64)
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
    """Cleanup a raw recording (denoise/declip/normalize) via ffmpeg.

    This is the audio-quality preprocessing step, run before transcription or
    storage so every uploaded/recorded clip is consistent. Returns cleaned
    WAV (base64) and, when upload=True, a stored URL.
    """
    if req.audio_base64:
        audio = _decode_base64_guarded(req.audio_base64)
    elif req.library_path:
        sb = _sb()
        if not sb:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        key = _valid_library_key(req.library_path)
        if not key:
            raise HTTPException(status_code=400, detail="invalid library_path")
        data = sb.storage.from_("library").download(key[len("library/") :])
        audio = data if isinstance(data, bytes | bytearray) else data.read()
    else:
        raise HTTPException(status_code=400, detail="audio_base64 or library_path required")

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
    """Transcribe audio -> MIDI (+ synthesized WAV + note events).

    Accepts raw audio as base64, or a path in the `library` bucket.
    Stores midi + wav to Supabase when upload=True.
    """
    if req.audio_base64:
        audio = _decode_base64_guarded(req.audio_base64)
    elif req.library_path:
        sb = _sb()
        if not sb:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        key = _valid_library_key(req.library_path)
        if not key:
            raise HTTPException(status_code=400, detail="invalid library_path")
        data = sb.storage.from_("library").download(key[len("library/") :])
        audio = data if isinstance(data, bytes | bytearray) else data.read()
    else:
        raise HTTPException(status_code=400, detail="audio_base64 or library_path required")

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
        midi_path = f"midi/{uuid.uuid4().hex}.mid"
        wav_path = f"midi/{uuid.uuid4().hex}.wav"
        out["midi_url"] = _sb_upload("midi", midi_path, midi, "audio/midi")
        out["wav_url"] = _sb_upload("midi", wav_path, wav, "audio/wav")
    return out


class AnalyzeRequest(BaseModel):
    audio_base64: str | None = None
    midi_base64: str | None = None
    fmt: str = "wav"


@app.post("/music/analyze")
@limiter.limit("30/minute")
def analyze(req: AnalyzeRequest, request: Request, _auth=Depends(verify_token_optional)):
    """Analyze audio (or MIDI) for key, tempo, time signature, and chords.

    Prefers raw audio (audio_base64) because that yields reliable tempo and
    time-signature detection; when MIDI is also supplied its note events refine
    the key and chord estimates. Falls back to MIDI-only when no audio is given.
    Public: anonymous requests are allowed (auth is optional)."""
    has_audio = bool(req.audio_base64)
    has_midi = bool(req.midi_base64)
    if not has_audio and not has_midi:
        raise HTTPException(status_code=400, detail="audio_base64 or midi_base64 required")

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
            ext = _sanitize_fmt(req.fmt).lstrip(".")
            audio_path = os.path.join(td, f"input.{ext}")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

        if has_midi:
            try:
                midi_bytes = base64.b64decode(req.midi_base64, validate=True)
            except Exception:
                raise HTTPException(status_code=400, detail="invalid midi base64") from None
            midi_path = os.path.join(td, "input.mid")
            with open(midi_path, "wb") as f:
                f.write(midi_bytes)

        try:
            if audio_path:
                result = analyze_audio(audio_path, midi_path)
            else:
                result = analyze_from_midi(midi_path)
        except Exception:
            logger.exception("analysis failed")
            raise HTTPException(status_code=500, detail="analysis failed") from None

    return result


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


@app.delete("/music/library/transcription/{record_id:path}")
@limiter.limit("30/minute")
def delete_transcription(record_id: str, request: Request, auth=Depends(verify_token)):
    """Delete a saved transcription from the `transcriptions` bucket."""
    sb = _sb()
    if not sb:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    sb.storage.from_("transcriptions").remove([record_id])
    return {"status": "deleted"}
