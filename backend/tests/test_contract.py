"""Contract test: every route the Next.js app proxies to MUST exist in FastAPI.

The frontend never calls the Oracle backend directly; it goes through
`app/api/*/route.ts` -> `proxyToBackend(path)`. If a proxy target drifts from a
real backend route (typo, renamed endpoint, removed route), the UI silently 500s
in production. This test fails CI on that drift.
"""

import re
from pathlib import Path

import pytest

import main

REPO_ROOT = Path(__file__).resolve().parents[2]
API_DIR = REPO_ROOT / "app" / "api"

PROXY_RE = re.compile(r'proxyToBackend\(\s*req\s*,\s*["\`]([^"\`]+)["\`]')


def _proxied_paths() -> set[str]:
    paths: set[str] = set()
    if not API_DIR.exists():
        return paths
    for route in API_DIR.rglob("route.ts"):
        text = route.read_text()
        for m in PROXY_RE.finditer(text):
            raw = m.group(1)
            # Expand `{param}` / `${param}` template segments to a placeholder.
            normalized = re.sub(r"\$\{[^}]+\}|\{[^}]+\}", "x", raw)
            paths.add(normalized)
    return paths


def _backend_paths() -> set[tuple[str, frozenset]]:
    result: set[tuple[str, frozenset]] = set()
    for r in main.app.routes:
        methods = getattr(r, "methods", None)
        if not methods:
            continue
        if not (methods & {"GET", "POST", "DELETE", "PUT", "PATCH"}):
            continue
        result.add((r.path, frozenset(methods)))
    return result


PROXIED = _proxied_paths()
BACKEND = _backend_paths()


def _backend_has(path: str, method: str) -> bool:
    # Match ignoring FastAPI path param syntax ({job_id} vs x).
    norm = re.sub(r"\{[^}]+\}", "x", path)
    for bpath, methods in BACKEND:
        bnorm = re.sub(r"\{[^}]+\}", "x", bpath)
        if bnorm == norm and method in methods:
            return True
    return False


@pytest.mark.parametrize("path", sorted(PROXIED))
def test_proxied_route_exists_in_backend(path):
    # Determine the HTTP method the frontend uses for this path.
    method = "POST"  # all music/* and train/compare/generate are POST
    if path.startswith("/models") or path.startswith("/jobs") or path.startswith("/health"):
        method = "GET"
    if path.startswith("/music/library/"):
        method = "DELETE"
    assert PROXIED, "no proxied paths discovered — check app/api scanning"
    assert _backend_has(
        path, method
    ), f"Frontend proxies to '{path}' ({method}) but no matching backend route exists"
