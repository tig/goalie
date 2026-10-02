"""The empty service answers a health check."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _read_stderr(proc: subprocess.Popen[bytes]) -> str:
    # The pipe stays open while the process is alive. Kill before reading.
    if proc.poll() is None:
        proc.kill()
        proc.wait(timeout=5)
    if proc.stderr is None:
        return ""
    return proc.stderr.read().decode("utf-8", errors="replace")


class HealthTests(unittest.TestCase):
    def test_health_answers_ok(self) -> None:
        port = _free_port()
        env = os.environ.copy()
        env["PORT"] = str(port)
        env["HOST"] = "127.0.0.1"
        proc = subprocess.Popen(
            ["node", "src/server.ts"],
            cwd=SERVER,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            body = b""
            status = 0
            last_error = ""
            for _ in range(50):
                if proc.poll() is not None:
                    err = _read_stderr(proc)
                    self.fail(f"process exited {proc.returncode}\n{err}")
                try:
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:{port}/health", timeout=0.2
                    ) as response:
                        status = response.status
                        body = response.read()
                    break
                except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                    last_error = str(error)
                    time.sleep(0.05)
            else:
                stderr = _read_stderr(proc)
                self.fail(f"health did not answer: {last_error}\n{stderr}")
            self.assertEqual(status, 200)
            self.assertEqual(body, b"ok")
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()

    def test_reading_stderr_stops_a_live_process(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        started = time.monotonic()
        try:
            _read_stderr(proc)
            self.assertLess(time.monotonic() - started, 5)
            self.assertIsNotNone(proc.poll())
        finally:
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()
