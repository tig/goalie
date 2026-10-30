"""GOALIE_DB names the SQLite file the process opens."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from live_server import get, running_server


class DatabasePathTests(unittest.TestCase):
    def test_server_opens_the_configured_file(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            database = Path(scratch) / "pilot.db"
            with running_server(database) as (proc, port):
                reply = get(proc, port, "/health")
                self.assertEqual(reply.status, 200)
                self.assertTrue(database.is_file())


if __name__ == "__main__":
    unittest.main()
