"""GET / answers an HTML page that loads the shared chrome, even before sign-in."""

from __future__ import annotations

import unittest

from live_server import get, running_server

# The shared chrome contract. Host configuration serves /_xw/.
CHROME_TAGS = (
    '<link rel="icon" type="image/svg+xml" href="/_xw/brand/favicon.svg">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/_xw/brand/favicon-32.png">',
    '<link rel="stylesheet" href="/_xw/chrome.css">',
    '<script src="/_xw/chrome.js" defer></script>',
    '<meta name="xw-app" content="Goalie">',
)


class HomeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with running_server() as (proc, port):
            cls.reply = get(proc, port, "/")
            cls.deep = get(proc, port, "/goals/XW-0001?view=list")
        with running_server(extra_env={"GOALIE_SIGN_IN_URL": "https://login.example/start"}) as (proc, port):
            cls.configured = get(proc, port, "/")

    def test_home_is_html_with_a_body(self) -> None:
        self.assertEqual(self.reply.status, 401)
        self.assertTrue(self.reply.content_type.startswith("text/html"), self.reply.content_type)
        self.assertIn("charset=utf-8", self.reply.content_type.lower())
        self.assertTrue(self.reply.body.startswith(b"<!doctype html>"))

    def test_home_loads_the_shared_chrome(self) -> None:
        text = self.reply.body.decode("utf-8")
        for tag in CHROME_TAGS:
            self.assertIn(tag, text)

    def test_home_without_a_token_asks_to_sign_in(self) -> None:
        text = self.reply.body.decode("utf-8")
        self.assertIn("<h1>Sign in to Goalie</h1>", text)
        self.assertIn("<title>Goalie</title>", text)

    def test_the_sign_in_page_links_to_the_host_login_and_back(self) -> None:
        text = self.reply.body.decode("utf-8")
        self.assertIn('<a href="/oauth2/start?rd=%2F">Sign in</a>', text)
        self.assertIn('<a href="/oauth2/start?rd=%2Fgoals%2FXW-0001%3Fview%3Dlist">Sign in</a>', self.deep.body.decode("utf-8"))

    def test_the_login_route_is_process_configuration(self) -> None:
        self.assertIn('<a href="https://login.example/start?rd=%2F">Sign in</a>', self.configured.body.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
