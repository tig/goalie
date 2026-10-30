"""D1: past 1,000 Events, the goal page sends the newest 100 and a cursor; GET /api/goals/:id/events pages the rest (Codebase QA's 3,000-comment benchmark)."""

from __future__ import annotations

import json
import sqlite3
import sys
import time
import unittest
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed

COMMENTS = 3_000


class HistoryPagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        assert cls.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        cls.auth = {"Authorization": f"Bearer {token}"}
        server = running_server(cls.store.path, env)
        cls.proc, cls.port = server.__enter__()
        cls.addClassCleanup(server.__exit__, None, None, None)
        cls.addClassCleanup(cls.store.close)
        assert get(cls.proc, cls.port, "/health").status == 200
        for start in range(0, COMMENTS, 1_000):
            batch = [{"op": "comment", "kind": "goal", "id": "XW-0003", "text": f"Comment {n}"} for n in range(start, start + 1_000)]
            reply = post(cls.proc, cls.port, "/api/commands", {"commands": batch}, cls.auth)
            assert reply.status == 200, reply.body[:200]
        started = time.monotonic()
        cls.reply = get(cls.proc, cls.port, "/api/goals/XW-0003", cls.auth)
        cls.millis = (time.monotonic() - started) * 1000
        cls.page = json.loads(cls.reply.body)
        print(f"\n  goal page at {COMMENTS} comments: {len(cls.reply.body) / 1024:.0f} KB, {cls.millis:.0f} ms", file=sys.stderr)

    def events(self, path: str) -> Any:
        reply = get(self.proc, self.port, path, self.auth)
        return reply.status, json.loads(reply.body)

    def expected(self) -> list[int]:
        """Every Event of XW-0003's history from the log: the goal and its Promotion Milestone XW-0004, newest first."""
        with sqlite3.connect(self.store.path) as db:
            rows = db.execute("SELECT sequence FROM event WHERE entity_kind = 'goal' AND entity IN ('XW-0003', 'XW-0004') ORDER BY sequence DESC").fetchall()
        return [r[0] for r in rows]

    def test_past_1000_events_the_page_sends_the_newest_100(self) -> None:
        events = self.page["events"]
        self.assertEqual(len(events), 100)
        self.assertEqual([e["sequence"] for e in events], self.expected()[:100])
        self.assertEqual(self.page["olderEvents"], events[-1]["sequence"])

    def test_the_tab_counts_are_for_the_whole_history(self) -> None:
        # The Frontend Engineer: "History 100" would be wrong past 1,000.
        self.assertEqual(self.page["eventCount"], len(self.expected()))
        self.assertEqual(self.page["commentCount"], COMMENTS)

    def test_the_page_is_small(self) -> None:
        # Codebase QA measured 4,327 KB here before paging.
        self.assertLess(len(self.reply.body), 200 * 1024)

    def test_the_pages_walk_the_whole_history_once(self) -> None:
        sequences = [e["sequence"] for e in self.page["events"]]
        cursor = self.page["olderEvents"]
        while cursor is not None:
            status, body = self.events(f"/api/goals/XW-0003/events?before={cursor}")
            self.assertEqual(status, 200, body)
            self.assertLessEqual(len(body["events"]), 100)
            sequences += [e["sequence"] for e in body["events"]]
            cursor = body["olderEvents"]
        self.assertEqual(sequences, self.expected())

    def test_a_short_history_is_sent_whole(self) -> None:
        status, body = self.events("/api/goals/XW-0001")
        self.assertEqual(status, 200)
        self.assertIsNone(body["olderEvents"])
        self.assertGreater(len(body["events"]), 0)

    def test_a_bad_cursor_or_goal_is_refused(self) -> None:
        self.assertEqual(self.events("/api/goals/XW-0003/events?before=abc")[0], 400)
        self.assertEqual(self.events("/api/goals/XW-0999/events?before=10")[0], 404)


if __name__ == "__main__":
    unittest.main()
