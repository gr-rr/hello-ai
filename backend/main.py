from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import uuid
import io
import json
import base64
import os
import logging
import threading

from musicgen_server import generate_audio
from finetune_server import (
    list_base_models,
    load_dataset_jsonl,
    train_lora,
    generate as ft_generate,
)
from music_features import transcribe_audio, midi_to_wav, enhance_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(title="hello-ai backend", version="0.2.0")

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
    audio_base64: Optional[str] = None
    audio_url: Optional[str] = None
    format: str = "wav"
    duration: int


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Finetune studio
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    base_model: str
    dataset_text: Optional[str] = None  # raw JSONL
    dataset_path: Optional[str] = None  # path in Supabase 'datasets' bucket
    name: Optional[str] = None
    lora_r: int = 16
    lora_alpha: int = 32
    epochs: float = 3.0
    learning_rate: float = 2e-4
    max_seq_len: Optional[int] = None
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
    audio_base64: Optional[str] = None
    library_path: Optional[str] = None
    fmt: str = "wav"
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    upload: bool = True  # store midi + wav to Supabase


def _sb():
    from supabase import create_client
    import os

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def _append_log(job_id: str, msg: str):
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
                text = data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else data
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
                            f"{job_id}/{fname}", f.read(),
                            file_options={"content-type": "application/octet-stream"},
                        )
                sb3.table("models").insert({
                    "name": req.name or f"{req.base_model.split('/')[-1]} LoRA",
                    "base_model": req.base_model,
                    "job_id": job_id,
                    "adapter_path": adapter_path,
                }).execute()

            if sb:
                sb.table("jobs").update({
                    "status": "done", "finished_at": "now()",
                    "loss_log": _job_logs.get(job_id, ""),
                }).eq("id", job_id).execute()
            _append_log(job_id, "DONE")
    except Exception as e:
        logger.exception("training failed")
        _append_log(job_id, f"ERROR: {e}")
        if sb:
            sb.table("jobs").update({
                "status": "error", "error": str(e), "finished_at": "now()",
            }).eq("id", job_id).execute()


@app.get("/models/base")
def models_base():
    return {"models": list_base_models()}


@app.post("/train")
def train(req: TrainRequest, background_tasks: BackgroundTasks):
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
        "lora_r": req.lora_r, "lora_alpha": req.lora_alpha,
        "epochs": req.epochs, "learning_rate": req.learning_rate,
        "max_seq_len": req.max_seq_len or 1024, "batch_size": req.batch_size,
        "name": req.name,
    }
    sb = _sb()
    if sb:
        sb.table("jobs").insert({
            "id": job_id, "base_model": req.base_model,
            "params": params, "dataset_path": req.dataset_path, "status": "queued",
        }).execute()
    _job_logs[job_id] = "queued"
    background_tasks.add_task(_run_training, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
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
def list_models():
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
                            fh.write(data if isinstance(data, (bytes, bytearray)) else data.read())
            return m["base_model"], (adapter_dir if os.path.isdir(adapter_dir) else None)
    return base_model, None


@app.post("/compare")
def compare(req: CompareRequest):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")
    base_a, ad_a = _resolve_adapter(req.model_a, req.base_model)
    base_b, ad_b = _resolve_adapter(req.model_b, req.base_model)
    try:
        a_text = ft_generate(base_a, ad_a, req.prompt, req.max_new_tokens, req.temperature)
        b_text = ft_generate(base_b, ad_b, req.prompt, req.max_new_tokens, req.temperature)
    except Exception as e:
        logger.exception("compare failed")
        raise HTTPException(status_code=500, detail=f"compare failed: {e}")
    return {"prompt": req.prompt, "a": a_text, "b": b_text}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    logger.info("generating: %s (%.1fs, g=%.1f, t=%.1f)",
                req.prompt, req.duration, req.guidance_scale, req.temperature)

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
        raise HTTPException(status_code=500, detail=f"generation failed: {e}")

    if req.upload:
        url = _upload_to_supabase(wav_bytes, req)
        return GenerateResponse(audio_url=url, duration=req.duration)

    b64 = base64.b64encode(wav_bytes).decode("ascii")
    return GenerateResponse(audio_base64=b64, duration=req.duration)


def _upload_to_supabase(wav_bytes: bytes, req: GenerateRequest) -> str:
    # Server-side upload using the service-role key (kept on the server, never the browser).
    from supabase import create_client
    import os

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase not configured on server")

    sb = create_client(url, key)
    path = f"tracks/{uuid.uuid4().hex}.wav"
    sb.storage.from_("audio").upload(path, wav_bytes, {"content-type": "audio/wav"})
    # Insert metadata row.
    sb.table("tracks").insert({
        "prompt": req.prompt.strip(),
        "model": req.model,
        "duration": req.duration,
        "guidance_scale": req.guidance_scale,
        "temperature": req.temperature,
        "audio_path": path,
    }).execute()
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
async def upload_library(req: dict):
    """Store a raw audio file in the `library` bucket.

    Body: { name, data_base64, fmt }. Returns { path, url }.
    """
    name = (req.get("name") or f"{uuid.uuid4().hex}").replace("/", "_")
    fmt = (req.get("fmt") or "wav").lstrip(".")
    data_b64 = req.get("data_base64")
    if not data_b64:
        raise HTTPException(status_code=400, detail="data_base64 required")
    try:
        raw = base64.b64decode(data_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid base64")
    path = f"library/{uuid.uuid4().hex}-{name}.{fmt}"
    url = _sb_upload("library", path, raw, f"audio/{fmt}")
    return {"path": path, "url": url}


class EnhanceRequest(BaseModel):
    audio_base64: Optional[str] = None
    library_path: Optional[str] = None
    fmt: str = "wav"
    upload: bool = True


@app.post("/music/enhance")
def enhance(req: EnhanceRequest):
    """Cleanup a raw recording (denoise/declip/normalize) via ffmpeg.

    This is the audio-quality preprocessing step, run before transcription or
    storage so every uploaded/recorded clip is consistent. Returns cleaned
    WAV (base64) and, when upload=True, a stored URL.
    """
    if req.audio_base64:
        try:
            audio = base64.b64decode(req.audio_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid base64")
    elif req.library_path:
        sb = _sb()
        if not sb:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        key = req.library_path.replace("library/", "")
        data = sb.storage.from_("library").download(key)
        audio = data if isinstance(data, (bytes, bytearray)) else data.read()
    else:
        raise HTTPException(status_code=400, detail="audio_base64 or library_path required")

    try:
        cleaned = enhance_audio(audio, fmt=req.fmt)
    except Exception as e:
        logger.exception("enhance failed")
        raise HTTPException(status_code=500, detail=f"enhance failed: {e}")

    out = {"wav_base64": base64.b64encode(cleaned).decode("ascii")}
    if req.upload:
        path = f"library/{uuid.uuid4().hex}-enhanced.wav"
        out["url"] = _sb_upload("library", path, cleaned, "audio/wav")
    return out


@app.post("/music/transcribe")
def transcribe(req: TranscribeRequest):
    """Transcribe audio -> MIDI (+ synthesized WAV + note events).

    Accepts raw audio as base64, or a path in the `library` bucket.
    Stores midi + wav to Supabase when upload=True.
    """
    if req.audio_base64:
        try:
            audio = base64.b64decode(req.audio_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid base64")
    elif req.library_path:
        sb = _sb()
        if not sb:
            raise HTTPException(status_code=500, detail="Supabase not configured")
        key = req.library_path.replace("library/", "")
        data = sb.storage.from_("library").download(key)
        audio = data if isinstance(data, (bytes, bytearray)) else data.read()
    else:
        raise HTTPException(status_code=400, detail="audio_base64 or library_path required")

    try:
        result = transcribe_audio(audio, fmt=req.fmt,
                                  onset_threshold=req.onset_threshold,
                                  frame_threshold=req.frame_threshold)
    except Exception as e:
        logger.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"transcription failed: {e}")

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

