"""GET / is the Priorities view for the signed-in actor, drawn as a timeline (SPEC.md §8.2, release plan Decisions 1)."""

from __future__ import annotations

import json
import re
import subprocess
import time
import unittest

from goalie_cli import SERVER, Store, update
from live_server import get, running_server

ISSUER = "https://issuer.test/tenant/v2.0"
AUDIENCE = "api://goalie-test"


def signed() -> tuple[str, dict[str, str]]:
    now = int(time.time())
    request = {"tokens": [{"claims": {"iss": ISSUER, "aud": AUDIENCE, "sub": "sub-chelsea", "nbf": now - 5, "exp": now + 600}}]}
    proc = subprocess.run(["node", "tests/sign_token.mjs"], cwd=SERVER, input=json.dumps(request).encode(), capture_output=True, check=True)
    out = json.loads(proc.stdout)
    env = {"GOALIE_ISSUERS": json.dumps([{"issuer": ISSUER, "audience": AUDIENCE, "jwks": out["jwks"]}])}
    return out["tokens"][0], env


def positions(text: str, needles: list[str]) -> list[int]:
    return [text.index(needle) for needle in needles]


class PrioritiesHomeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        result = cls.store.write("chelsea", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))
        assert result["ok"], result
        token, env = signed()
        with running_server(cls.store.path, env) as (proc, port):
            cls.home = get(proc, port, "/", {"Authorization": f"Bearer {token}"})
            cls.anonymous = get(proc, port, "/")
        cls.text = cls.home.body.decode("utf-8")
        code, cls.printed = cls.store.run("home")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.store.close()

    def test_signed_in_home_is_the_priorities_view(self) -> None:
        self.assertEqual(self.home.status, 200)
        self.assertIn("<h2>Priorities</h2>", self.text)

    def test_priorities_are_in_rank_order(self) -> None:
        ids = ["XW-0001", "XW-0002", "XW-0003"]
        found = positions(self.text, [f'id="goal-{goal}"' for goal in ids])
        self.assertEqual(found, sorted(found))
        ranks = re.findall(r'class="rank[^"]*"[^>]*>(\d+)<', self.text)
        self.assertEqual(ranks[:3], ["1", "2", "3"])

    def test_every_date_shows_its_date_type(self) -> None:
        for label in ("Committed Oct 1", "Committed Nov 15", "Fantasy Nov 30", "Promotion Milestone Nov 6"):
            self.assertIn(label, self.text)

    def test_health_is_written_as_well_as_colored(self) -> None:
        for goal, health in (("XW-0001", "RED"), ("XW-0002", "YELLOW"), ("XW-0003", "GREEN")):
            row = self.text[self.text.index(f'id="goal-{goal}"'):]
            self.assertIn(f'data-health="{health}"', row[:400])

    def test_the_cut_line_is_drawn_after_the_funded_priorities(self) -> None:
        cut = self.text.index('class="cut"')
        self.assertGreater(cut, self.text.index('id="goal-XW-0003"'))

    def test_goalie_own_goal_tree_is_open_under_xw_0003(self) -> None:
        parent = self.text.index('id="goal-XW-0003"')
        for sub in ["XW-0004"] + [f"XW-{n:04d}" for n in range(5, 12)]:
            self.assertGreater(self.text.index(f'id="goal-{sub}"'), parent, sub)
        self.assertIn("Stand up the spine: store, rules, sign-in, event log", self.text)

    def test_home_needs_a_signed_in_actor(self) -> None:
        self.assertEqual(self.anonymous.status, 401)
        body = self.anonymous.body.decode("utf-8")
        self.assertNotIn("XW-0001", body)
        self.assertIn("Sign in", body)

    def test_the_local_tool_prints_the_same_view(self) -> None:
        self.assertIn('id="goal-XW-0001"', self.printed["html"])


if __name__ == "__main__":
    unittest.main()
