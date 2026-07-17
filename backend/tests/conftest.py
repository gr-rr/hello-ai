import os
import tempfile

os.environ.setdefault("ADAPTER_ROOT", tempfile.mkdtemp(prefix="adapter_root_"))

from fastapi.testclient import TestClient
import pytest

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
