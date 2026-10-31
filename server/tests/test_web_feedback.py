"""In-app feedback (tig/goalie#56): the body the app posts to same-origin /api/feedback, its focus, and the words it shows for each answer (server/web/src/model/feedback.ts)."""

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
NOT_AVAILABLE = "Feedback is not available. Your issue was not sent."
SIGN_IN = "Sign in again, then send your issue."
NOT_REACHED = "GOALIE could not reach the server. Your issue was not sent."
GOAL_FOCUS = {"label": "Cut time-to-value", "id": "XW-0003", "kind": "goal", "breadcrumb": ["Home", "Run Excaliwire on GOALIE"]}


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

    def test_with_no_item_the_body_is_the_note_and_the_page_url(self) -> None:
        # xw-feedback leaves out the Focus section when there is no focus (excaliwire/factory#3192).
        body = run(f'return f.feedbackBody("  The cut line is hard to find.  ", {json.dumps(URL)});')
        self.assertEqual(body, {"note": "The cut line is hard to find.", "page": {"url": URL, "app": "goalie"}})

    def test_with_an_item_the_body_carries_its_focus(self) -> None:
        # The Canon Viewer's focus shape: label, id, kind, breadcrumb.
        body = run(f'return f.feedbackBody("A note", {json.dumps(URL)}, {json.dumps(GOAL_FOCUS)});')
        self.assertEqual(body, {"note": "A note", "page": {"url": URL, "app": "goalie"}, "focus": GOAL_FOCUS})

    def test_the_body_names_no_repo_labels_or_email(self) -> None:
        # xw-feedback picks the repo and the labels. The host is to add the email from the sign-in (#56, item 2).
        body = run(f'return f.feedbackBody("A note", {json.dumps(URL)});')
        self.assertEqual(set(body), {"note", "page"})  # type: ignore[arg-type]
        self.assertNotIn("email", json.dumps(body))
        self.assertEqual(set(run(f'return f.feedbackBody("A note", {json.dumps(URL)}, {json.dumps(GOAL_FOCUS)});')), {"note", "page", "focus"})  # type: ignore[arg-type]

    def test_a_long_note_is_clipped_to_the_limit(self) -> None:
        self.assertEqual(run('return [f.NOTE_MAX, f.feedbackBody("x".repeat(5000), "/").note.length];'), [4000, 4000])


class FocusTests(unittest.TestCase):
    """The focus of a note is the element a right-click picked. Ported from excaliwire/factory presentation-core src/feedback/hit.ts and describe.ts, with their tests."""

    def test_focus_is_the_item_and_the_names_above_it(self) -> None:
        chain = [{"kind": "priority", "id": "PRI-3", "label": "Run Excaliwire on GOALIE"}, {"kind": "goal", "id": "XW-0003", "label": "Cut time-to-value"}]
        self.assertEqual(run(f'return f.feedbackFocus("Home", {json.dumps(chain)});'), GOAL_FOCUS)

    def test_no_item_is_no_focus(self) -> None:
        self.assertIsNone(run('return f.feedbackFocus("Home", []) ?? null;'))

    def test_data_focus_is_json_of_the_item(self) -> None:
        # describe.ts: data-focus is JSON of the selection. Do not invent a second encoding.
        item = {"kind": "goal", "id": "XW-0003", "label": "Cut time-to-value"}
        self.assertEqual(run(f"return f.decodeFocus(f.encodeFocus({json.dumps(item)}));"), item)

    def test_a_bad_data_focus_is_no_item(self) -> None:
        self.assertEqual(run('return ["", null, "{", "[]", JSON.stringify({ kind: "goal", id: "XW-1" }), JSON.stringify({ kind: 1, id: "a", label: "b" })].map((raw) => f.decodeFocus(raw));'), [None] * 6)

    def test_a_non_element_is_not_feedback_chrome(self) -> None:
        # hit.test.ts: isFeedbackChrome is false for a non-element.
        self.assertEqual(run("return f.isFeedbackChrome(null);"), False)

    def test_the_mark_follows_the_picked_element_and_clears(self) -> None:
        # hit.test.ts: the mark holds while the menu or dialog is open and clears on set(null).
        got = run("""const el = () => { const a = new Map(); return { setAttribute: (k, v) => a.set(k, v), removeAttribute: (k) => a.delete(k), getAttribute: (k) => a.get(k) ?? null }; };
const mark = f.createFeedbackMark(); const one = el(); const two = el();
const seen = []; mark.set(one); seen.push(one.getAttribute("data-feedback-focused"));
mark.set(two); seen.push(one.getAttribute("data-feedback-focused"), two.getAttribute("data-feedback-focused"));
mark.set(null); seen.push(two.getAttribute("data-feedback-focused")); return seen;""")
        self.assertEqual(got, ["", None, "", None])

    def test_a_keyboard_menu_opens_at_the_middle_of_the_element(self) -> None:
        # hit.ts: a contextmenu from the keyboard has no pointer, so the menu opens at the element's middle.
        rect = '{ left: 100, top: 40, width: 200, height: 20 }'
        self.assertEqual(run(f"return [f.menuPoint({{ clientX: 7, clientY: 9 }}, {rect}), f.menuPoint({{ clientX: 0, clientY: 0 }}, {rect})];"), [{"x": 7, "y": 9}, {"x": 200, "y": 50}])


class FeedbackAnswerTests(unittest.TestCase):
    def test_201_says_filed_as_issue_n(self) -> None:
        url = "https://github.com/tig/goalie/issues/99"
        got = answer(201, json.dumps({"ok": True, "issueUrl": url, "issueNumber": 99, "url": url, "html_url": url, "number": 99}))
        self.assertEqual(got, {"sent": True, "message": "Filed as issue #99", "issue": {"number": 99, "url": url}})

    def test_201_with_no_number_or_url_says_filed(self) -> None:
        self.assertEqual(answer(201, json.dumps({"ok": True})), {"sent": True, "message": "Filed."})
        self.assertEqual(answer(201, json.dumps({"ok": True, "number": 99})), {"sent": True, "message": "Filed."})
        self.assertEqual(answer(201, json.dumps({"ok": True, "number": 99, "issueUrl": "javascript:alert(1)"})), {"sent": True, "message": "Filed."})

    def test_an_empty_note_says_to_describe_the_issue(self) -> None:
        self.assertEqual(answer(400, json.dumps({"error": "note is empty"})), {"sent": False, "message": "Describe the issue, then send it."})

    def test_401_is_a_refused_caller_key_so_feedback_is_not_available(self) -> None:
        # xw-feedback answers 401 only when it refuses the caller key that the host adds (excaliwire/factory#3192).
        self.assertEqual(answer(401, json.dumps({"error": "caller key refused"})), {"sent": False, "message": NOT_AVAILABLE})

    def test_a_redirect_says_to_sign_in_again(self) -> None:
        # The app posts with redirect "manual", and reads an opaque redirect as "sign in again", not as a network failure.
        self.assertEqual(answer(0, kind="opaqueredirect"), {"sent": False, "message": SIGN_IN})

    def test_403_says_the_feedback_service_refused_the_page(self) -> None:
        self.assertEqual(answer(403, json.dumps({"error": "origin refused"})), {"sent": False, "message": "The feedback service refused this page. Your issue was not sent."})

    def test_429_says_to_wait(self) -> None:
        self.assertEqual(answer(429, json.dumps({"error": "too many notes"})), {"sent": False, "message": "Too many issues in one minute. Wait a minute, then send it again."})

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
        self.assertEqual(answer(0, kind="error"), {"sent": False, "message": NOT_REACHED})

    def test_another_status_is_named(self) -> None:
        self.assertEqual(answer(500, "boom", "text/plain"), {"sent": False, "message": "Your issue was not sent (status 500)."})


def post(reply: str, focus: dict | None = None) -> dict:
    """Call data.ts postFeedback on a page with search text and a hash. `reply` is JS for what fetch gives back. Return the request and the answer."""
    script = f"""globalThis.location = {{ origin: "https://goalie.example", pathname: "/goals/XW-0003", search: "?q=private%20words", hash: "#history", href: "https://goalie.example/goals/XW-0003?q=private%20words#history" }};
let sent;
globalThis.fetch = async (url, init) => {{ sent = {{ url, init }}; {reply} }};
const data = await import("{DATA}");
const answer = await data.postFeedback("  A note  ", {json.dumps(focus) if focus else "undefined"});
process.stdout.write(JSON.stringify({{ url: sent.url, method: sent.init.method, redirect: sent.init.redirect, headers: sent.init.headers, body: JSON.parse(sent.init.body), answer }}));"""
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class PostFeedbackTests(unittest.TestCase):
    """data.ts postFeedback: the request it sends, and how it reads what comes back."""

    def test_it_posts_json_to_the_same_origin_feedback_path(self) -> None:
        got = post('return new Response(JSON.stringify({ ok: true, issueUrl: "https://github.com/tig/goalie/issues/7", number: 7 }), { status: 201, headers: { "content-type": "application/json" } });')
        self.assertEqual(got["url"], "/api/feedback")
        self.assertEqual(got["method"], "POST")
        self.assertEqual(got["headers"]["content-type"], "application/json")
        self.assertEqual(got["answer"], {"sent": True, "message": "Filed as issue #7", "issue": {"number": 7, "url": "https://github.com/tig/goalie/issues/7"}})

    def test_the_page_url_has_no_query_and_no_hash(self) -> None:
        # tig/goalie is public. Search text and the hash must not go into an issue.
        got = post('return new Response("", { status: 404 });')
        self.assertEqual(got["body"], {"note": "A note", "page": {"url": "https://goalie.example/goals/XW-0003", "app": "goalie"}})

    def test_it_sends_the_focus_it_is_given(self) -> None:
        got = post('return new Response("", { status: 404 });', GOAL_FOCUS)
        self.assertEqual(got["body"]["focus"], GOAL_FOCUS)

    def test_it_does_not_follow_a_redirect_and_reads_one_as_sign_in(self) -> None:
        got = post('return { status: 0, type: "opaqueredirect", headers: new Headers(), text: async () => "" };')
        self.assertEqual(got.get("redirect"), "manual")
        self.assertEqual(got["answer"], {"sent": False, "message": SIGN_IN})

    def test_a_failed_fetch_says_the_server_was_not_reached(self) -> None:
        got = post('throw new TypeError("fetch failed");')
        self.assertEqual(got["answer"], {"sent": False, "message": NOT_REACHED})


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
