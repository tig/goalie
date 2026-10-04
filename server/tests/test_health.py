"""The service answers a health check."""

from __future__ import annotations

import subprocess
import sys
import time
import unittest

from live_server import get, read_stderr, running_server


class HealthTests(unittest.TestCase):
    def test_health_answers_ok(self) -> None:
        with running_server() as (proc, port):
            reply = get(proc, port, "/health")
        self.assertEqual(reply.status, 200)
        self.assertEqual(reply.body, b"ok")

    def test_reading_stderr_stops_a_live_process(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        started = time.monotonic()
        try:
            read_stderr(proc)
            self.assertLess(time.monotonic() - started, 5)
            self.assertIsNotNone(proc.poll())
        finally:
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()
