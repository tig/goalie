"""The empty service answers GET /health and nothing else."""

from __future__ import annotations

import os
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from goalie.__main__ import main
from goalie.health import bind

_BODY = b'{"status":"ok"}\n'
_TYPE = "application/json"


class HealthServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = bind("127.0.0.1", 0)
        cls.thread = threading.Thread(
            target=cls.server.serve_forever,
            kwargs={"poll_interval": 0.1},
            daemon=True,
        )
        cls.thread.start()
        address = cls.server.server_address
        cls.port = int(address[1])

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def _get(self, path: str) -> tuple[int, bytes, str]:
        url = f"http://127.0.0.1:{self.port}{path}"
        last: Exception | None = None
        for _ in range(40):
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    body = response.read()
                    content_type = response.headers["Content-Type"]
                    return response.status, body, content_type
            except urllib.error.HTTPError as error:
                with error:
                    header = ""
                    if error.headers is not None:
                        header = error.headers.get("Content-Type", "")
                    return error.code, error.read(), header
            except urllib.error.URLError as error:
                last = error
                time.sleep(0.05)
        raise AssertionError(f"server did not answer: {last}")

    def test_health_is_ok(self) -> None:
        status, body, content_type = self._get("/health")
        self.assertEqual(status, 200)
        self.assertEqual(body, _BODY)
        self.assertEqual(content_type, _TYPE)

    def test_other_path_is_404(self) -> None:
        status, _body, _content_type = self._get("/")
        self.assertEqual(status, 404)


class MainEntry(unittest.TestCase):
    def test_main_listens_on_all_interfaces_and_the_port(self) -> None:
        with (
            patch("goalie.__main__.serve") as serve,
            patch.dict(os.environ, {"PORT": "9090"}),
        ):
            main()
        serve.assert_called_once_with("0.0.0.0", 9090)

    def test_main_defaults_the_port_to_8080(self) -> None:
        env = os.environ.copy()
        env.pop("PORT", None)
        with (
            patch("goalie.__main__.serve") as serve,
            patch.dict(os.environ, env, clear=True),
        ):
            main()
        serve.assert_called_once_with("0.0.0.0", 8080)
