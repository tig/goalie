"""GET / answers an HTML home page that loads the shared chrome."""

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

    def test_home_is_html_with_a_body(self) -> None:
        self.assertEqual(self.reply.status, 200)
        self.assertTrue(self.reply.content_type.startswith("text/html"), self.reply.content_type)
        self.assertIn("charset=utf-8", self.reply.content_type.lower())
        self.assertTrue(self.reply.body.startswith(b"<!doctype html>"))

    def test_home_loads_the_shared_chrome(self) -> None:
        text = self.reply.body.decode("utf-8")
        for tag in CHROME_TAGS:
            self.assertIn(tag, text)

    def test_home_says_coming_soon(self) -> None:
        text = self.reply.body.decode("utf-8")
        self.assertIn("<h1>Goalie: coming soon</h1>", text)
        self.assertIn("<title>Goalie</title>", text)


if __name__ == "__main__":
    unittest.main()
