"""In-app feedback (tig/goalie#56): the body the app posts to same-origin /api/feedback, and the words it shows for each answer (server/web/src/model/feedback.ts)."""

from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web" / "src"
FEEDBACK = (WEB / "model" / "feedback.ts").as_uri()
DATA = (WEB / "data.ts").as_uri()

URL = "https://goalie.example/goals/XW-0003?view=list"
NOT_AVAILABLE = "Feedback is not available. Your note was not sent."


def run(body: str) -> object:
    """Run an ES module that imports the feedback model as `f`, and return what it prints as JSON."""
    script = f'import * as f from "{FEEDBACK}";\nconst out = await (async () => {{ {body} }})();\nprocess.stdout.write(JSON.stringify(out));'
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


def answer(status: int, text: str = "", content_type: str = "application/json", kind: str = "basic") -> object:
    reply = json.dumps({"status": status, "type": kind, "contentType": content_type, "text": text})
    return run(f"return f.feedbackAnswer({reply});")


class FeedbackBodyTests(unittest.TestCase):
    def test_the_note_goes_to_the_same_origin_feedback_path(self) -> None:
        self.assertEqual(run("return f.FEEDBACK_PATH;"), "/api/feedback")

    def test_the_body_is_the_note_and_the_page_url(self) -> None:
        # xw-feedback titles a goalie note from the note and leaves out the Focus section when there is no focus (excaliwire/factory#3192). So the body has no focus.
        body = run(f'return f.feedbackBody("  The cut line is hard to find.  ", {json.dumps(URL)});')
        self.assertEqual(body, {"note": "The cut line is hard to find.", "page": {"url": URL, "app": "goalie"}})

    def test_the_body_names_no_repo_labels_or_email(self) -> None:
        # xw-feedback picks the repo and the labels. The host is to add the email from the sign-in (#56, item 2).
        body = run(f'return f.feedbackBody("A note", {json.dumps(URL)});')
        self.assertEqual(set(body), {"note", "page"})  # type: ignore[arg-type]
        self.assertNotIn("email", json.dumps(body))

    def test_a_long_note_is_clipped_to_the_limit(self) -> None:
        self.assertEqual(run('return [f.NOTE_MAX, f.feedbackBody("x".repeat(5000), "/").note.length];'), [4000, 4000])


class FeedbackAnswerTests(unittest.TestCase):
    def test_201_says_the_note_was_sent(self) -> None:
        self.assertEqual(answer(201, json.dumps({"ok": True, "issueUrl": "https://github.com/tig/goalie/issues/99", "issueNumber": 99})), {"sent": True, "message": "Sent. Thank you."})

    def test_an_empty_note_says_to_write_one(self) -> None:
        self.assertEqual(answer(400, json.dumps({"error": "note is empty"})), {"sent": False, "message": "Write a note, then send it."})

    def test_401_is_a_refused_caller_key_so_feedback_is_not_available(self) -> None:
        # xw-feedback answers 401 only when it refuses the caller key that the host adds (excaliwire/factory#3192).
        self.assertEqual(answer(401, json.dumps({"error": "caller key refused"})), {"sent": False, "message": NOT_AVAILABLE})

    def test_a_redirect_says_to_sign_in_again(self) -> None:
        # The app posts with redirect "manual", and reads an opaque redirect as "sign in again", not as a network failure.
        self.assertEqual(answer(0, kind="opaqueredirect"), {"sent": False, "message": "Sign in again, then send your note."})

    def test_403_says_the_feedback_service_refused_the_page(self) -> None:
        self.assertEqual(answer(403, json.dumps({"error": "origin refused"})), {"sent": False, "message": "The feedback service refused this page. Your note was not sent."})

    def test_429_says_to_wait(self) -> None:
        self.assertEqual(answer(429, json.dumps({"error": "too many notes"})), {"sent": False, "message": "Too many notes in one minute. Wait a minute, then send it again."})

    def test_404_and_502_say_feedback_is_not_available(self) -> None:
        # Until the host sends /api/feedback to xw-feedback, GOALIE itself answers 404. xw-feedback answers 502 when it cannot file.
        self.assertEqual(answer(404, json.dumps({"error": "not_found", "reason": "no API route POST /api/feedback"})), {"sent": False, "message": NOT_AVAILABLE})
        self.assertEqual(answer(502, json.dumps({"error": "not filed"})), {"sent": False, "message": NOT_AVAILABLE})

    def test_a_page_where_json_was_expected_is_not_sent(self) -> None:
        # A 200 with an HTML page, or with JSON that is not ok, must not read as sent.
        self.assertEqual(answer(200, "<!doctype html><html></html>", "text/html"), {"sent": False, "message": NOT_AVAILABLE})
        self.assertEqual(answer(200, ""), {"sent": False, "message": NOT_AVAILABLE})
        self.assertEqual(answer(201, json.dumps({"ok": False})), {"sent": False, "message": NOT_AVAILABLE})

    def test_no_answer_says_the_server_was_not_reached(self) -> None:
        self.assertEqual(answer(0, kind="error"), {"sent": False, "message": "GOALIE could not reach the server. Your note was not sent."})

    def test_another_status_is_named(self) -> None:
        self.assertEqual(answer(500, "boom", "text/plain"), {"sent": False, "message": "Your note was not sent (status 500)."})


def post(reply: str) -> dict:
    """Call data.ts postFeedback on a page with search text and a hash. `reply` is JS for what fetch gives back. Return the request and the answer."""
    script = f"""globalThis.location = {{ origin: "https://goalie.example", pathname: "/goals/XW-0003", search: "?q=private%20words", hash: "#history", href: "https://goalie.example/goals/XW-0003?q=private%20words#history" }};
let sent;
globalThis.fetch = async (url, init) => {{ sent = {{ url, init }}; {reply} }};
const data = await import("{DATA}");
const answer = await data.postFeedback("  A note  ");
process.stdout.write(JSON.stringify({{ url: sent.url, method: sent.init.method, redirect: sent.init.redirect, headers: sent.init.headers, body: JSON.parse(sent.init.body), answer }}));"""
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class PostFeedbackTests(unittest.TestCase):
    """data.ts postFeedback: the request it sends, and how it reads what comes back."""

    def test_it_posts_json_to_the_same_origin_feedback_path(self) -> None:
        got = post('return new Response(JSON.stringify({ ok: true, issueNumber: 7 }), { status: 201, headers: { "content-type": "application/json" } });')
        self.assertEqual(got["url"], "/api/feedback")
        self.assertEqual(got["method"], "POST")
        self.assertEqual(got["headers"]["content-type"], "application/json")
        self.assertEqual(got["answer"], {"sent": True, "message": "Sent. Thank you."})

    def test_the_page_url_has_no_query_and_no_hash(self) -> None:
        # tig/goalie is public. Search text and the hash must not go into an issue.
        got = post('return new Response("", { status: 404 });')
        self.assertEqual(got["body"], {"note": "A note", "page": {"url": "https://goalie.example/goals/XW-0003", "app": "goalie"}})

    def test_it_does_not_follow_a_redirect_and_reads_one_as_sign_in(self) -> None:
        got = post('return { status: 0, type: "opaqueredirect", headers: new Headers(), text: async () => "" };')
        self.assertEqual(got.get("redirect"), "manual")
        self.assertEqual(got["answer"], {"sent": False, "message": "Sign in again, then send your note."})

    def test_a_failed_fetch_says_the_server_was_not_reached(self) -> None:
        got = post('throw new TypeError("fetch failed");')
        self.assertEqual(got["answer"], {"sent": False, "message": "GOALIE could not reach the server. Your note was not sent."})


class FeedbackControlTests(unittest.TestCase):
    def test_the_top_bar_on_every_page_carries_the_feedback_control(self) -> None:
        # App draws TopBar on every page, signed in or not yet loaded. The control is in it, not in one page.
        app = (WEB / "App.tsx").read_text(encoding="utf-8")
        top_bar = re.search(r"function TopBar\(.*?\n}\n", app, re.S)
        self.assertIsNotNone(top_bar)
        self.assertRegex(top_bar.group(0), r"\n      <Feedback />\n")  # type: ignore[union-attr]
        self.assertIn('import { Feedback } from "./Feedback.tsx";', app)


if __name__ == "__main__":
    unittest.main()
