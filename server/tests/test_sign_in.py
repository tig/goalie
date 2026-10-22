"""A verified token maps to one actor, human or agent (ADR 0005)."""

from __future__ import annotations

import json
import subprocess
import time
import unittest
from typing import Any

from goalie_cli import SERVER, Store, create

ISSUER = "https://issuer.test/tenant/v2.0"
AUDIENCE = "api://goalie-test"


def claims(**extra: Any) -> dict[str, Any]:
    now = int(time.time())
    base = {"iss": ISSUER, "aud": AUDIENCE, "iat": now, "nbf": now - 5, "exp": now + 600}
    base.update(extra)
    return base


TOKENS: list[dict[str, Any]] = [
    {"claims": claims(sub="sub-tig", email="tig@example.com")},
    {"claims": claims(idtyp="app", azp="app-bot", sub="sp-bot")},
    {"claims": claims(sub="sub-tig"), "foreign_key": True},
    {"claims": claims(sub="sub-tig", iss="https://other.test/v2.0")},
    {"claims": claims(sub="sub-tig", aud="api://someone-else")},
    {"claims": claims(sub="sub-tig", exp=int(time.time()) - 600)},
    {"claims": claims(sub="sub-tig"), "header": {"alg": "none"}},
    {"claims": claims(sub="app-bot")},
    {"claims": claims(idtyp="app", azp="sub-tig")},
    {"claims": claims(sub="sub-tig", nbf=int(time.time()) + 600)},
]


class SignInTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        proc = subprocess.run(
            ["node", "tests/sign_token.mjs"],
            cwd=SERVER,
            input=json.dumps({"tokens": TOKENS}).encode(),
            capture_output=True,
            check=True,
        )
        signed = json.loads(proc.stdout)
        cls.tokens = signed["tokens"]
        cls.env = {"GOALIE_ISSUERS": json.dumps([{"issuer": ISSUER, "audience": AUDIENCE, "jwks": signed["jwks"]}])}

    def setUp(self) -> None:
        self.store = Store()
        self.addCleanup(self.store.close)
        for command in [
            create("actor", "tig", {"kind": "human", "display_name": "Tig", "email": "tig@example.com", "subject": "sub-tig"}),
            create("actor", "bot", {"kind": "agent", "display_name": "Bot", "operator": "tig", "app_id": "app-bot"}),
        ]:
            self.assertTrue(self.store.write("tig", command)["ok"])

    def whoami(self, headers: dict[str, str]) -> Any:
        return self.store.run("whoami", stdin=headers, env=self.env)[1]

    def bearer(self, index: int) -> dict[str, str]:
        return {"authorization": f"Bearer {self.tokens[index]}"}

    def assertActor(self, headers: dict[str, str], actor: str) -> None:
        result = self.whoami(headers)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["actor"]["id"], actor)

    def assertRefused(self, headers: dict[str, str]) -> None:
        result = self.whoami(headers)
        self.assertFalse(result["ok"], result)
        self.assertTrue(result["reason"])

    def test_human_token_maps_to_the_human_by_subject(self) -> None:
        self.assertActor(self.bearer(0), "tig")

    def test_agent_token_maps_to_the_agent_with_its_operator(self) -> None:
        result = self.whoami(self.bearer(1))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["actor"]["id"], "bot")
        self.assertEqual(result["actor"]["kind"], "agent")
        self.assertEqual(result["actor"]["operator"], "tig")

    def test_gate_forwarded_token_is_accepted(self) -> None:
        self.assertActor({"x-auth-request-access-token": self.tokens[0], "x-auth-request-email": "TIG@example.com"}, "tig")

    def test_forwarded_email_must_match_the_token(self) -> None:
        self.assertRefused({"authorization": f"Bearer {self.tokens[0]}", "x-auth-request-email": "chelsea@example.com"})

    def test_a_header_alone_authenticates_no_one(self) -> None:
        self.assertRefused({"x-auth-request-email": "tig@example.com"})
        self.assertRefused({})

    def test_signature_from_another_key_is_refused(self) -> None:
        self.assertRefused(self.bearer(2))

    def test_unlisted_issuer_is_refused(self) -> None:
        self.assertRefused(self.bearer(3))

    def test_wrong_audience_is_refused(self) -> None:
        self.assertRefused(self.bearer(4))

    def test_expired_token_is_refused(self) -> None:
        self.assertRefused(self.bearer(5))

    def test_unsigned_token_is_refused(self) -> None:
        self.assertRefused(self.bearer(6))

    def test_human_token_is_not_accepted_as_an_agent(self) -> None:
        self.assertRefused(self.bearer(7))

    def test_agent_token_is_not_accepted_as_a_human(self) -> None:
        self.assertRefused(self.bearer(8))

    def test_a_token_not_valid_yet_is_refused(self) -> None:
        self.assertRefused(self.bearer(9))

    def test_a_malformed_token_is_refused(self) -> None:
        for token in ("abc", "a.b.c", "e30.e30.", f"{self.tokens[0]}x"):
            self.assertRefused({"authorization": f"Bearer {token}"})

    def test_no_issuer_configured_refuses_every_token(self) -> None:
        result = self.store.run("whoami", stdin=self.bearer(0), env={"GOALIE_ISSUERS": ""})[1]
        self.assertFalse(result["ok"])


if __name__ == "__main__":
    unittest.main()
