"""GET /api/work answers the build team's queues: every work item, or one actor's (plan B4)."""

from __future__ import annotations

import json
import subprocess
import time
import unittest

from goalie_cli import SERVER, Store, update
from live_server import AUDIENCE, ISSUER, get, post, running_server, signed


def seat_token(app_id: str) -> tuple[str, dict[str, str]]:
    """An agent token for a seat, and the issuer that trusts it (ADR 0005)."""
    now = int(time.time())
    request = {"tokens": [{"claims": {"iss": ISSUER, "aud": AUDIENCE, "idtyp": "app", "azp": app_id, "sub": f"sp-{app_id}", "nbf": now - 5, "exp": now + 600}}]}
    out = json.loads(subprocess.run(["node", "tests/sign_token.mjs"], cwd=SERVER, input=json.dumps(request).encode(), capture_output=True, check=True).stdout)
    return out["tokens"][0], {"GOALIE_ISSUERS": json.dumps([{"issuer": ISSUER, "audience": AUDIENCE, "jwks": out["jwks"]}])}


class WorkApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        code, result = cls.store.run("seed", str(SERVER / "seed" / "build-team.json"))
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        assert cls.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        with running_server(cls.store.path, env) as (proc, port):
            auth = {"Authorization": f"Bearer {token}"}
            cls.team = json.loads(get(proc, port, "/api/work", auth).body)
            cls.mine = json.loads(get(proc, port, "/api/work?owner=backend-engineer", auth).body)
            cls.nobody = get(proc, port, "/api/work?owner=nobody", auth)
            cls.chelseas = json.loads(get(proc, port, "/api/work?owner=chelsea", auth).body)
            first = cls.team_first = json.loads(get(proc, port, "/api/work", auth).body)["items"][0]
            assert json.loads(post(proc, port, "/api/commands", {"commands": [{"op": "comment", "kind": "work_item", "id": first["id"], "text": "On the page"}]}, auth).body)["ok"]
            cls.page = json.loads(get(proc, port, f"/api/work-items/{first['id']}", auth).body)
            cls.lower = get(proc, port, f"/api/work-items/{first['id'].lower()}", auth)
            cls.missing = get(proc, port, "/api/work-items/WI-9999", auth)
        token, env = seat_token("app-backend-engineer")
        with running_server(cls.store.path, env) as (proc, port):
            cls.as_seat = get(proc, port, "/api/work?owner=backend-engineer", {"Authorization": f"Bearer {token}"})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_the_team_view_has_every_work_item(self) -> None:
        owners = {item["owner"] for item in self.team["items"]}
        self.assertIn("backend-engineer", owners)
        self.assertIn("frontend-engineer", owners)
        self.assertEqual(self.team["today"], "2026-10-23")

    def test_one_queue_has_only_that_owners_items(self) -> None:
        self.assertTrue(self.mine["items"])
        self.assertEqual({item["owner"] for item in self.mine["items"]}, {"backend-engineer"})
        # Codebase QA Q17: a wrong link must not read as an empty queue.
        self.assertEqual(self.nobody.status, 404)
        self.assertEqual(set(json.loads(self.nobody.body)), {"error", "reason"})

    def test_a_humans_queue_holds_the_agents_they_operate(self) -> None:
        # U4: Chelsea operates every seat, so her queue holds their items, each with its own owner.
        owners = {item["owner"] for item in self.chelseas["items"]}
        self.assertIn("backend-engineer", owners)
        self.assertEqual(len(self.chelseas["items"]), len(self.team["items"]))
        self.assertEqual({item["owner"] for item in self.mine["items"]}, {"backend-engineer"})

    def test_an_agent_names_its_operator(self) -> None:
        self.assertEqual(self.team["actors"]["backend-engineer"]["operator"], "chelsea")
        self.assertNotIn("operator", self.team["actors"]["chelsea"])

    def test_the_answer_names_every_goal_and_actor_it_holds(self) -> None:
        for item in self.team["items"]:
            self.assertEqual(self.team["goals"][item["goal"]]["id"], item["goal"])
            self.assertEqual(self.team["actors"][item["owner"]]["kind"], "agent")
            self.assertIn("late", item)

    def test_a_work_item_page_has_the_item_its_goal_and_only_its_own_activity(self) -> None:
        """W8: GET /api/work-items/:key answers one work item, the goal it is under, the actors it names, and its own Events, newest first."""
        self.assertEqual(self.page["item"]["id"], self.team_first["id"])
        self.assertEqual(self.page["goal"]["id"], self.team_first["goal"])
        self.assertTrue(self.page["goal"]["summary"])
        self.assertIn(self.team_first["owner"], self.page["actors"])
        self.assertEqual({e["entity"] for e in self.page["events"]}, {self.team_first["id"]})
        self.assertEqual(self.page["events"][0]["field"], "comment")
        self.assertEqual(self.page["events"][0]["new"], "On the page")
        self.assertIn("githubRepos", self.page)
        self.assertIn("githubScope", self.page)

    def test_a_work_item_key_is_read_in_any_case_and_an_unknown_one_is_404(self) -> None:
        self.assertEqual(self.lower.status, 200)
        self.assertEqual(self.missing.status, 404)
        self.assertEqual(set(json.loads(self.missing.body)), {"error", "reason"})

    def test_a_seat_reads_its_queue_with_its_own_agent_token(self) -> None:
        self.assertEqual(self.as_seat.status, 200, self.as_seat.body)
        body = json.loads(self.as_seat.body)
        self.assertEqual(body["me"], {"id": "backend-engineer", "name": "Backend Engineer", "kind": "agent", "operator": "chelsea"})


if __name__ == "__main__":
    unittest.main()
