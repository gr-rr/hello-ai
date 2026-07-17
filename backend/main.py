from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import io
import base64
import logging

from musicgen_server import generate_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(title="hello-ai music backend", version="0.1.0")


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
