"""GOALIE_DB names the SQLite file the process opens."""

from __future__ import annotations

import sqlite3
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

    def test_a_file_from_before_start_date_gains_it_and_keeps_its_work_items(self) -> None:
        """#73: a work item gained start_date. A deployment's file made before that still opens, with its rows."""
        with tempfile.TemporaryDirectory() as scratch:
            database = Path(scratch) / "old.db"
            with sqlite3.connect(database) as old:
                old.execute("CREATE TABLE work_item (id TEXT PRIMARY KEY, version INTEGER NOT NULL, goal TEXT NOT NULL, title TEXT NOT NULL, owner TEXT NOT NULL, status TEXT NOT NULL, due_date TEXT, links TEXT)")
                old.execute("INSERT INTO work_item VALUES ('WI-0001', 1, 'GOAL-1', 'Old row', 'jane', 'In Progress', '2026-11-02', NULL)")
            with running_server(database) as (proc, port):
                self.assertEqual(get(proc, port, "/health").status, 200)
            with sqlite3.connect(database) as now:
                columns = [row[1] for row in now.execute("PRAGMA table_info(work_item)")]
                self.assertIn("start_date", columns)
                self.assertEqual(now.execute("SELECT title, start_date FROM work_item").fetchall(), [("Old row", None)])


if __name__ == "__main__":
    unittest.main()
