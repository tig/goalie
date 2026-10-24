"""GET /api/events streams each committed Event as Server-Sent Events (ADR 0007, plan B5)."""

from __future__ import annotations

import http.client
import json
import queue
import socket
import threading
import time
import unittest
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed


class Stream:
    """One open GET /api/events. Each message lands on a queue as {"id", "data"}."""

    def __init__(self, port: int, headers: dict[str, str]) -> None:
        self.conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        self.conn.request("GET", "/api/events", headers=headers)
        self.response = self.conn.getresponse()
        self.messages: queue.Queue[dict[str, Any]] = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        message: dict[str, Any] = {}
        try:
            for raw in self.response:
                line = raw.decode("utf-8").rstrip("\n")
                if line == "":
                    if "data" in message:
                        self.messages.put(message)
                    message = {}
                elif line.startswith("id:"):
                    message["id"] = int(line[3:].strip())
                elif line.startswith("data:"):
                    message["data"] = json.loads(line[5:].strip())
        except (OSError, ValueError):
            return

    def next(self, within: float) -> dict[str, Any] | None:
        try:
            return self.messages.get(timeout=within)
        except queue.Empty:
            return None

    def close(self) -> None:
        # Shut the socket down first: the reader thread holds the response open until its read times out.
        if self.conn.sock is not None:
            try:
                self.conn.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        self.conn.close()


class EventsStreamTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        code, result = self.store.run("seed")
        assert code == 0, result
        chelsea = self.store.read("actor", "chelsea")
        assert self.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        self.auth = {"Authorization": f"Bearer {token}"}
        server = running_server(self.store.path, env)
        self.proc, self.port = server.__enter__()
        self.addCleanup(server.__exit__, None, None, None)
        assert get(self.proc, self.port, "/health").status == 200

    def open(self, **headers: str) -> Stream:
        stream = Stream(self.port, {**self.auth, **headers})
        self.addCleanup(stream.close)
        self.assertEqual(stream.response.status, 200)
        self.assertTrue(stream.response.getheader("Content-Type", "").startswith("text/event-stream"))
        return stream

    def comment(self, text: str) -> int:
        reply = post(self.proc, self.port, "/api/commands", {"commands": [{"op": "comment", "kind": "goal", "id": "XW-0003", "text": text}]}, self.auth)
        assert reply.status == 200, reply.body
        return json.loads(reply.body)["events"][0]["sequence"]

    def test_a_write_after_connect_arrives_within_one_second(self) -> None:
        stream = self.open()
        started = time.monotonic()
        sequence = self.comment("Live")
        message = stream.next(within=1.0)
        self.assertIsNotNone(message, "no event within 1 s")
        self.assertLess(time.monotonic() - started, 1.5)
        self.assertEqual(message["id"], sequence)  # type: ignore[index]
        self.assertEqual((message["data"]["field"], message["data"]["new"], message["data"]["entity"]), ("comment", "Live", "XW-0003"))  # type: ignore[index]

    def test_a_reconnect_receives_every_event_after_its_last_id_in_order(self) -> None:
        first = self.comment("One")
        second = self.comment("Two")
        third = self.comment("Three")
        stream = self.open(**{"Last-Event-ID": str(first)})
        got = [stream.next(within=1.0) for _ in range(2)]
        self.assertEqual([m["id"] for m in got if m], [second, third])
        self.assertEqual([m["data"]["new"] for m in got if m], ["Two", "Three"])

    def test_a_rolled_back_batch_sends_nothing(self) -> None:
        stream = self.open()
        broken = [{"op": "comment", "kind": "goal", "id": "XW-0003", "text": "Rolled back"}, {"op": "update", "kind": "goal", "id": "XW-0999", "base_version": 1, "fields": {}}]
        self.assertEqual(post(self.proc, self.port, "/api/commands", {"commands": broken}, self.auth).status, 404)
        checked = [{"op": "comment", "kind": "goal", "id": "XW-0003", "text": "Only a check"}]
        self.assertEqual(post(self.proc, self.port, "/api/commands", {"commands": checked, "check": True}, self.auth).status, 200)
        self.comment("Kept")
        message = stream.next(within=1.0)
        self.assertEqual(message["data"]["new"] if message else None, "Kept")

    def test_the_stream_needs_a_verified_actor(self) -> None:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        self.addCleanup(conn.close)
        conn.request("GET", "/api/events")
        self.assertEqual(conn.getresponse().status, 401)


if __name__ == "__main__":
    unittest.main()
