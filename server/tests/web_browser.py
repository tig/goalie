"""The built app in headless Chrome, signed in as Chelsea on the Excaliwire seed. Shared by the browser tests."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import unittest
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

from goalie_cli import SERVER, Store, update
from live_server import get, running_server, signed

MEASURE = Path(__file__).resolve().parent / "measure_page.mjs"
BUILD = SERVER / "web" / "dist" / "index.html"
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

Open = Callable[[int, str], Any]


def chrome() -> str | None:
    found = os.environ.get("CHROME") or next((p for p in map(shutil.which, ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")) if p), None)
    return found or (MAC_CHROME if Path(MAC_CHROME).is_file() else None)


@contextmanager
def signed_app() -> Iterator[tuple[Open, Callable[[str], Any]]]:
    """Yield open(width, expression), which loads Home in a fresh Chrome and returns what the expression gives, and api(path), which reads the API as Chelsea.
    CI builds the app and has Chrome, so there a missing one fails. A local run without them skips."""
    browser = chrome()
    missing = "no Chrome (set CHROME)" if not browser else "no build (run npm run build --prefix server)" if not BUILD.is_file() else ""
    if missing:
        if os.environ.get("CI"):
            raise AssertionError(missing)
        raise unittest.SkipTest(missing)
    store = Store()
    try:
        code, result = store.run("seed")
        assert code == 0, result
        chelsea = store.read("actor", "chelsea")
        assert store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        with running_server(store.path, env) as (proc, port):
            assert get(proc, port, "/health").status == 200

            def open_page(width: int, expression: str) -> Any:
                done = subprocess.run(["node", str(MEASURE), str(browser), f"http://127.0.0.1:{port}/", str(width), "812", expression], capture_output=True, text=True, timeout=90, env={**os.environ, "GOALIE_TOKEN": token})
                if done.returncode != 0:
                    raise AssertionError(done.stderr)
                return json.loads(done.stdout)

            def api(path: str) -> Any:
                reply = get(proc, port, path, {"Authorization": f"Bearer {token}"})
                assert reply.status == 200, reply.body
                return json.loads(reply.body)

            yield open_page, api
    finally:
        store.close()
