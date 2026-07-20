import base64

import pytest

import main
from main import MAX_UPLOAD_BYTES, _now, _sanitize_fmt, _valid_library_key


class _FakeStorage:
    def __init__(self):
        self.store = {}

    def download(self, key):
        return self.store.get(key, b"")

    def from_(self, bucket):
        self._bucket = bucket
        return self


class _FakeSB:
    def __init__(self):
        self.storage = _FakeStorage()
        self.auth = _FakeAuth()


class _FakeAuth:
    def get_user(self, token):
        return {"user": {"id": "test-user"}}


@pytest.fixture(autouse=True)
def _stub_supabase(monkeypatch):
    monkeypatch.setattr(main, "_sb", lambda: _FakeSB())


def _auth():
    return {"Authorization": "Bearer test-token"}


# --- pure guard units (no network) -----------------------------------------


def test_valid_library_key_accepts_well_formed():
    key = _valid_library_key(f"library/{'0' * 32}-song.wav")
    assert key is not None and key.startswith("library/")


def test_valid_library_key_rejects_traversal():
    assert _valid_library_key("library/../../etc/passwd") is None
    assert _valid_library_key("../library/x.wav") is None
    assert _valid_library_key("library/x/../../y") is None


def test_valid_library_key_rejects_non_uuid():
    assert _valid_library_key("library/notauuid-song.wav") is None


def test_sanitize_fmt_strips_traversal():
    assert _sanitize_fmt("../../etc/passwd") == ".wav"
    assert _sanitize_fmt("WAV") == ".wav"


def test_now_returns_parseable_utc_iso():
    from datetime import datetime

    dt = datetime.fromisoformat(_now())
    assert dt.tzinfo is not None


def test_max_upload_bytes_default():
    assert MAX_UPLOAD_BYTES == 26214400


# --- endpoint-level guards (auth stubbed) -----------------------------------


def test_upload_library_rejects_oversized_payload(client):
    big = base64.b64encode(b"x" * (MAX_UPLOAD_BYTES + 1)).decode()
    r = client.post(
        "/music/library",
        headers=_auth(),
        json={"name": "big.wav", "fmt": "wav", "data_base64": big},
    )
    assert r.status_code == 413


def test_upload_library_rejects_bad_base64(client):
    r = client.post(
        "/music/library",
        headers=_auth(),
        json={"name": "x.wav", "fmt": "wav", "data_base64": "!!!notb64!!!"},
    )
    assert r.status_code == 400


def test_enhance_rejects_invalid_library_path(client):
    r = client.post(
        "/music/enhance", headers=_auth(), json={"library_path": "library/../../secret"}
    )
    assert r.status_code == 400


def test_transcribe_rejects_invalid_library_path(client):
    r = client.post("/music/transcribe", headers=_auth(), json={"library_path": "../escape"})
    assert r.status_code == 400


def test_analyze_requires_midi_base64(client):
    r = client.post("/music/analyze", headers=_auth(), json={})
    assert r.status_code == 422


def test_analyze_rejects_invalid_base64(client):
    r = client.post(
        "/music/analyze",
        headers=_auth(),
        json={"midi_base64": "!!!notb64!!!"},
    )
    assert r.status_code == 400


def test_analyze_rejects_oversize_audio(client, monkeypatch):
    monkeypatch.setattr(main, "analyze_audio", lambda *a, **k: {"key": {}})
    monkeypatch.setattr(main, "analyze_from_midi", lambda *a, **k: {"key": {}})
    big = base64.b64encode(b"x" * (MAX_UPLOAD_BYTES + 1)).decode()
    r = client.post(
        "/music/analyze",
        headers=_auth(),
        json={"audio_base64": big, "fmt": "wav"},
    )
    assert r.status_code == 413


def test_analyze_accepts_library_path(client, monkeypatch):
    monkeypatch.setattr(main, "analyze_from_midi", lambda *a, **k: {"key": {}, "tempo": {}})
    sb = _FakeSB()
    sb.storage.store["owner-1/x.mid"] = b"MThd\x00\x00\x00\x06\x00\x00"
    monkeypatch.setattr(main, "_sb", lambda: sb)
    r = client.post(
        "/music/analyze",
        headers=_auth(),
        json={"library_path": "midi/owner-1/x.mid"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_analyze_rejects_invalid_library_path(client):
    r = client.post(
        "/music/analyze",
        headers=_auth(),
        json={"library_path": "../escape"},
    )
    assert r.status_code == 400
