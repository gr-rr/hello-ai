import os
import tempfile

os.environ.setdefault("ADAPTER_ROOT", tempfile.mkdtemp(prefix="adapter_root_"))

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
