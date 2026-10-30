"""Keys come from the issuer's discovery document, are refetched at most once per 5 minutes, and a failed fetch refuses (ADR 0005)."""

from __future__ import annotations

import json
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from goalie_cli import SERVER, Store, create
from live_server import free_port, get, running_server

AUDIENCE = "api://goalie-test"


class FakeIssuer:
    """An OpenID issuer on localhost. It serves a discovery document and a key set, and counts key-set fetches."""

    def __init__(self) -> None:
        self.keys: list[dict[str, Any]] = []
        self.key_fetches = 0
        issuer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 (the stdlib names it)
                if self.path.endswith("/.well-known/openid-configuration"):
                    body = {"issuer": issuer.issuer, "jwks_uri": f"{issuer.base}/keys"}
                elif self.path == "/keys":
                    issuer.key_fetches += 1
                    body = {"keys": issuer.keys}
                else:
                    self.send_error(404)
                    return
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args: Any) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.issuer = f"{self.base}/tenant/v2.0"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


def sign(issuer: str, kids: list[str]) -> tuple[dict[str, Any], list[str]]:
    """Sign one token per kid with one fresh key. Return that key as a JWK and the tokens."""
    now = int(time.time())
    claims = {"iss": issuer, "aud": AUDIENCE, "oid": "oid-tig", "sub": "pairwise-tig", "iat": now, "nbf": now - 5, "exp": now + 600}
    request = {"tokens": [{"claims": claims, "header": {"kid": kid}} for kid in kids]}
    proc = subprocess.run(["node", "tests/sign_token.mjs"], cwd=SERVER, input=json.dumps(request).encode(), capture_output=True, check=True)
    signed = json.loads(proc.stdout)
    return signed["jwks"]["keys"][0], signed["tokens"]


class IssuerKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.issuer = FakeIssuer()
        self.addCleanup(self.issuer.close)
        self.store = Store()
        self.addCleanup(self.store.close)
        tig = create("actor", "tig", {"kind": "human", "display_name": "Tig", "subject": "oid-tig"})
        self.assertTrue(self.store.write("tig", tig)["ok"])
        self.env = {"GOALIE_ISSUERS": json.dumps([{"issuer": self.issuer.issuer, "audience": AUDIENCE}])}
        self.jwk, self.tokens = sign(self.issuer.issuer, ["k1", "k2", "k3"])

    def serve(self, *kids: str) -> None:
        self.issuer.keys = [{**self.jwk, "kid": kid} for kid in kids]

    def test_keys_come_from_the_discovery_document(self) -> None:
        self.serve("k1")
        result = self.store.run("whoami", stdin={"authorization": f"Bearer {self.tokens[0]}"}, env=self.env)[1]
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["actor"]["id"], "tig")

    def test_a_rotated_key_is_refetched_once_per_five_minutes(self) -> None:
        self.serve("k1")
        with running_server(self.store.path, self.env) as (proc, port):
            bearer = lambda i: {"authorization": f"Bearer {self.tokens[i]}"}  # noqa: E731
            self.assertEqual(get(proc, port, "/api/priorities", bearer(0)).status, 200)
            self.assertEqual(self.issuer.key_fetches, 1)
            self.serve("k1", "k2")
            self.assertEqual(get(proc, port, "/api/priorities", bearer(1)).status, 200)
            self.assertEqual(self.issuer.key_fetches, 2)
            for _ in range(3):
                self.assertEqual(get(proc, port, "/api/priorities", bearer(2)).status, 401)
            self.assertEqual(self.issuer.key_fetches, 2)

    def test_an_issuer_that_cannot_be_reached_refuses_the_token(self) -> None:
        self.serve("k1")
        env = {"GOALIE_ISSUERS": json.dumps([{"issuer": self.issuer.issuer, "audience": AUDIENCE, "jwks_uri": f"http://127.0.0.1:{free_port()}/keys"}])}
        result = self.store.run("whoami", stdin={"authorization": f"Bearer {self.tokens[0]}"}, env=env)[1]
        self.assertFalse(result["ok"], result)
        self.assertIn("key", result["reason"])


if __name__ == "__main__":
    unittest.main()
