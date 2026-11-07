"""A non-owner who opens /github reads a sentence and a link to Home, not the server's raw refusal (QA 9). Measured in headless Chrome on the built app, signed in as Chelsea, who is not the GOALIE owner."""

from __future__ import annotations

import unittest

from web_browser import signed_app

# Null until the GitHub page has drawn its refusal.
REFUSED = """(async () => {
  const note = document.querySelector(".githubpage .note");
  if (!note) return null;
  return { text: note.textContent, links: [...note.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") })) };
})()"""


class GitHubPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with signed_app() as (open_page, _):
            cls.refused = open_page(1280, REFUSED, "/github")

    def test_a_non_owner_reads_a_sentence(self) -> None:
        self.assertEqual(self.refused["text"], "Only the GOALIE owner can see the GitHub page. Go to Home.")

    def test_a_non_owner_gets_a_link_to_home(self) -> None:
        self.assertEqual(self.refused["links"], [{"text": "Home", "href": "/"}])


if __name__ == "__main__":
    unittest.main()
