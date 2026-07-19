"""End-to-end test for POST /music/transcribe via the FastAPI TestClient.

Hits the real transcription pipeline (basic-pitch -> MIDI -> WAV). Auth is
bypassed by monkeypatching `verify_token` to return a dummy user, since the
route depends on Supabase which is unavailable in CI/local.

Skips (not fails) when the transcription ML deps aren't importable.
"""

import base64
import io
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

import main
from main import app

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sine_a4_c5.wav"


def _fixture_wav() -> bytes:
    if FIXTURE.exists():
        return FIXTURE.read_bytes()
    sr = 22050
    t = np.linspace(0, 1.0, sr, endpoint=False)
    sig = np.zeros(sr, dtype=np.float32)
    seg = sr // 2
    sig[:seg] += 0.3 * np.sin(2 * np.pi * 440.0 * t[:seg])
    sig[seg:] += 0.3 * np.sin(2 * np.pi * 523.25 * t[seg:])
    buf = io.BytesIO()
    sf.write(buf, np.clip(sig, -1.0, 1.0), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


class _FakeAuth:
    def get_user(self, token):
        return {"user": {"id": "test-user"}}


class _FakeStorage:
    def download(self, key):
        return b""


class _FakeSB:
    def __init__(self):
        self.storage = _FakeStorage()
        self.auth = _FakeAuth()


@pytest.fixture
def client(monkeypatch):
    # Patch the Supabase factory so verify_token's auth check succeeds. The
    # route relies on Depends(verify_token) which captured the original
    # function reference, so we satisfy it via the real auth path instead.
    monkeypatch.setattr(main, "_sb", lambda: _FakeSB())
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


def test_transcribe_e2e_contract(client):
    try:
        import basic_pitch  # noqa: F401
        import pretty_midi  # noqa: F401
    except Exception as e:  # pragma: no cover - environment guard
        pytest.skip(f"transcription deps unavailable: {e}")

    audio = _fixture_wav()
    payload = {
        "audio_base64": base64.b64encode(audio).decode("ascii"),
        "fmt": "wav",
        "upload": False,  # no Supabase in tests
    }
    r = client.post(
        "/music/transcribe",
        headers={"Authorization": "Bearer test-token"},
        json=payload,
    )
    assert r.status_code == 200, r.text
    body = r.json()

    for key in ("notes", "num_notes", "midi_base64", "wav_base64"):
        assert key in body, f"response missing {key}"

    notes = body["notes"]
    assert isinstance(notes, list)
    assert body["num_notes"] == len(notes)
    for note in notes:
        assert set(note.keys()) == {"pitch", "start", "end", "velocity"}
        assert isinstance(note["pitch"], int)
        assert isinstance(note["start"], int | float)
        assert isinstance(note["end"], int | float)
        assert isinstance(note["velocity"], int)

    midi = base64.b64decode(body["midi_base64"])
    wav = base64.b64decode(body["wav_base64"])
    assert isinstance(midi, bytes | bytearray) and len(midi) > 0
    assert isinstance(wav, bytes | bytearray) and len(wav) > 0
