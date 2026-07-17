"""Server-side MusicGen generation using HuggingFace transformers + torch.

Runs on the host's best available device (MPS on Mac, CUDA if present, else CPU).
Weights come from facebook/musicgen-small (cc-by-nc-4.0 — non-commercial).
"""

import io
import logging

import numpy as np
import torch
from scipy.io.wavfile import write as write_wav
from transformers import AutoProcessor, MusicgenForConditionalGeneration

logger = logging.getLogger("musicgen_server")

_MODEL_ID = "facebook/musicgen-small"
_processor = None
_model = None


def _load():
    global _processor, _model
    if _model is not None:
        return
    logger.info("loading %s", _MODEL_ID)
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else ("cuda" if torch.cuda.is_available() else "cpu")
    )
    logger.info("device: %s", device)
    _processor = AutoProcessor.from_pretrained(_MODEL_ID)
    _model = MusicgenForConditionalGeneration.from_pretrained(_MODEL_ID).to(device)


def generate_audio(
    prompt: str,
    duration: int = 5,
    guidance_scale: float = 3.0,
    temperature: float = 1.0,
    model: str = "Xenova/musicgen-small",
) -> bytes:
    _load()
    assert _processor is not None and _model is not None

    # MusicGen produces 50 tokens/sec of audio at 32kHz.
    max_new_tokens = int(duration * 50)

    inputs = _processor(
        text=[prompt],
        padding=True,
        return_tensors="pt",
    ).to(_model.device)

    with torch.no_grad():
        audio_values = _model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            guidance_scale=guidance_scale,
            temperature=temperature,
        )

    # audio_values: (batch, channels, samples) at 32kHz.
    audio = audio_values[0, 0].cpu().float().numpy()
    audio = np.clip(audio, -1.0, 1.0)

    buf = io.BytesIO()
    write_wav(buf, 32000, audio.astype(np.float32))
    return buf.getvalue()
