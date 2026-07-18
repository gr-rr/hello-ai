"""Smoke tests that exercise the real audio pipeline (not mocked).

These catch broken imports / broken ffmpeg / librosa paths that the unit tests
(with stubbed Supabase) do not. CI installs ffmpeg; locally the enhance test is
skipped if ffmpeg is unavailable.
"""

import shutil

import numpy as np
import pytest
import soundfile as sf

ffmpeg_available = shutil.which("ffmpeg") is not None

import analyze as analyze_mod  # noqa: E402  (import after guard)
from music_features import enhance_audio  # noqa: E402

TINY_WAV = np.zeros(2205, dtype=np.float32)  # 0.1s of silence @ 22050 Hz


def _write_tiny_wav(path: str) -> None:
    sf.write(path, TINY_WAV, 22050)


def test_analyze_module_imports():
    # If analyze_audio fails to import (missing librosa/torch), this fails loudly.
    assert callable(analyze_mod.analyze_audio)


def test_enhance_runs_real_ffmpeg(tmp_path):
    if not ffmpeg_available:
        pytest.skip("ffmpeg not installed")
    wav = tmp_path / "tiny.wav"
    _write_tiny_wav(str(wav))
    out = enhance_audio(wav.read_bytes(), fmt="wav")
    assert isinstance(out, bytes | bytearray) and len(out) > 0


def test_analyze_runs_real_pipeline(tmp_path):
    wav = tmp_path / "tiny.wav"
    _write_tiny_wav(str(wav))
    result = analyze_mod.analyze_audio(str(wav))
    assert isinstance(result, dict)
    assert "tempo" in result
