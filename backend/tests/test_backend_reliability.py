import threading

import pytest

import main


class _User:
    def __init__(self, uid):
        self.id = uid


class _AuthResult:
    def __init__(self, uid):
        self.user = _User(uid)


class _FakeAuth:
    def __init__(self, uid):
        self._uid = uid

    def get_user(self, token):
        return _AuthResult(self._uid)


class _FakeStorageBucket:
    def __init__(self, removed):
        self._removed = removed

    def remove(self, keys):
        self._removed.extend(keys)


class _FakeStorage:
    def __init__(self, removed):
        self._removed = removed

    def from_(self, bucket):
        return _FakeStorageBucket(self._removed)


class _FakeTable:
    def insert(self, *a, **k):
        return self

    def update(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self, *a, **k):
        return self


class _FakeSB:
    def __init__(self, uid, removed):
        self.auth = _FakeAuth(uid)
        self.storage = _FakeStorage(removed)

    def table(self, *a, **k):
        return _FakeTable()


@pytest.fixture(autouse=True)
def _disable_limiter(monkeypatch):
    monkeypatch.setattr(main.limiter, "enabled", False)


@pytest.fixture
def removed():
    return []


@pytest.fixture
def as_user(monkeypatch, removed):
    def _apply(uid):
        monkeypatch.setattr(main, "_sb", lambda: _FakeSB(uid, removed))

    return _apply


def _auth():
    return {"Authorization": "Bearer test-token"}


def test_delete_transcription_rejects_other_user(client, as_user, removed):
    as_user("owner-1")
    r = client.delete(
        "/music/library/transcription/transcriptions/someone-else/1-x.json",
        headers=_auth(),
    )
    assert r.status_code == 403
    assert removed == []


def test_delete_transcription_allows_owner(client, as_user, removed):
    as_user("owner-1")
    r = client.delete(
        "/music/library/transcription/transcriptions/owner-1/1-x.json",
        headers=_auth(),
    )
    assert r.status_code == 200
    assert removed == ["owner-1/1-x.json"]


def test_delete_transcription_rejects_malformed_path(client, as_user, removed):
    as_user("owner-1")
    r = client.delete(
        "/music/library/transcription/justonesegment",
        headers=_auth(),
    )
    assert r.status_code == 400


def test_training_slot_released_after_run(client, monkeypatch):
    assert not main._training_slot.locked()
    slot_held_during_run = threading.Event()

    def _fake_train_lora(base_model, rows, params, adapter_dir, log):
        if main._training_slot.locked():
            slot_held_during_run.set()

    monkeypatch.setattr(main, "train_lora", _fake_train_lora)
    monkeypatch.setattr(main, "load_dataset_jsonl", lambda text: [{"x": 1}])
    monkeypatch.setattr(main.os, "listdir", lambda p: [])
    monkeypatch.setattr(main, "_sb", lambda: _FakeSB("u", []))

    r = client.post(
        "/train",
        headers=_auth(),
        json={"base_model": "tiny", "dataset_text": '{"prompt":"a","completion":"b"}'},
    )
    assert r.status_code == 200
    assert slot_held_during_run.is_set()
    assert not main._training_slot.locked()


def test_training_slot_conflict_when_locked(client, monkeypatch):
    monkeypatch.setattr(main, "_sb", lambda: _FakeSB("u", []))
    assert main._training_slot.acquire(blocking=False)
    try:
        r = client.post(
            "/train",
            headers=_auth(),
            json={"base_model": "tiny", "dataset_text": "{}"},
        )
        assert r.status_code == 409
    finally:
        main._training_slot.release()
