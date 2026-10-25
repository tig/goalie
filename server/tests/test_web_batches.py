"""The app's batches (server/web/src/model/commands.ts), built from live API answers and posted to a seeded server, are stored (review of 5087caa)."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path
from typing import Any

from goalie_cli import Store, update
from live_server import get, post, running_server, signed

COMMANDS = (Path(__file__).resolve().parents[1] / "web" / "src" / "model" / "commands.ts").as_uri()


def build(body: str, **inputs: Any) -> dict[str, Any]:
    """Run an ES module with the app's batch builders as `commands` and each input as a const, and return the batch it builds."""
    consts = "".join(f"const {k} = {json.dumps(v)};\n" for k, v in inputs.items())
    script = f'import * as commands from "{COMMANDS}";\n{consts}process.stdout.write(JSON.stringify((() => {{ {body} }})()));'
    proc = subprocess.run(["node", "--no-warnings", "--input-type=module", "-e", script], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class WebBatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = Store()
        code, result = cls.store.run("seed")
        assert code == 0, result
        chelsea = cls.store.read("actor", "chelsea")
        assert cls.store.write("tig", update("actor", "chelsea", chelsea["version"], {"subject": "sub-chelsea"}))["ok"]
        token, env = signed("sub-chelsea")
        cls.auth = {"Authorization": f"Bearer {token}"}
        cls.server = running_server(cls.store.path, env)
        cls.proc, cls.port = cls.server.__enter__()
        assert get(cls.proc, cls.port, "/health").status == 200

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.__exit__(None, None, None)
        cls.store.close()

    def read(self, path: str) -> dict[str, Any]:
        reply = get(self.proc, self.port, path, self.auth)
        self.assertEqual(reply.status, 200, reply.body)
        return json.loads(reply.body)

    def send(self, batch: dict[str, Any]) -> dict[str, Any]:
        reply = post(self.proc, self.port, "/api/commands", batch, self.auth)
        answer = json.loads(reply.body)
        self.assertEqual(reply.status, 200, answer)
        return answer

    def types(self) -> dict[str, str]:
        options = self.read("/api/options")
        return {"goal": options["defaults"]["type"], "milestone": options["promotionMilestoneType"]}

    def test_a_sub_goal_on_its_parents_date_is_stored(self) -> None:
        parent = self.read("/api/goals/XW-0004")["goal"]
        batch = build("return commands.subGoalBatch(parent, { summary: 'Interview two candidates', owner: 'chelsea' }, types);", parent=parent, types=self.types())
        self.assertTrue(self.send(batch)["ok"])

    def test_a_sub_goal_with_its_own_fantasy_date_and_milestone_is_stored(self) -> None:
        parent = self.read("/api/goals/XW-0004")["goal"]
        row = {"summary": "Hire a designer", "owner": "chelsea", "date": {"due_date": "2027-03-01", "date_type": "Fantasy"}, "milestone": {"summary": "Commit a hire date", "due_date": "2026-11-12", "owner": "chelsea"}}
        batch = build("return commands.subGoalBatch(parent, row, types);", parent=parent, row=row, types=self.types())
        self.assertTrue(self.send(batch)["ok"])

    def test_a_work_item_is_filed(self) -> None:
        batch = build("return commands.workItemBatch('XW-0007', { title: 'Draw the panels', owner: 'chelsea', status: 'In Progress', due_date: null });")
        self.assertTrue(self.send(batch)["ok"])

    def test_a_comment_is_stored(self) -> None:
        self.assertTrue(self.send(build("return commands.commentBatch('goal', 'XW-0003', 'Looks right.');"))["ok"])

    def test_a_new_fantasy_goal_with_sub_goals_and_a_work_item_is_stored(self) -> None:
        options = self.read("/api/options")
        form = {
            "summary": "Launch the self-serve onboarding flow", "description": "", "owner": "chelsea", "priority": options["priorities"][0]["id"],
            "due_date": "2027-02-26", "date_type": "Fantasy", "health": "GREEN", "path_to_green": None, "plan": None, "plan_maturity": options["defaults"]["plan_maturity"],
            "more": {k: options["defaults"][k] for k in ("type", "severity", "state", "origination", "level", "visibility", "org_unit")},
            "milestone": {"summary": "Commit a date for onboarding", "due_date": "2026-11-20", "owner": "chelsea"},
            "milestoneType": self.types()["milestone"],
            "subGoals": [{"summary": "Write the copy", "owner": "chelsea"}],
            "workItems": [{"title": "Sketch the steps", "goal": 1, "owner": "chelsea", "due_date": None}],
        }
        answer = self.send(build("return commands.createBatch(form);", form=form))
        self.assertTrue(answer["ok"])
        self.assertIn("$goal", answer["ids"])

    def test_a_create_check_lists_every_refusal_in_its_place(self) -> None:
        options = self.read("/api/options")
        form = {
            "summary": "Run the spring offsite", "description": "", "owner": "chelsea", "priority": options["priorities"][0]["id"],
            "due_date": "2027-04-01", "date_type": "Fantasy", "health": "YELLOW", "path_to_green": None, "plan": None, "plan_maturity": options["defaults"]["plan_maturity"],
            "more": {k: options["defaults"][k] for k in ("type", "severity", "state", "origination", "level", "visibility", "org_unit")} | {"state": "In Progress"},
            "milestone": None, "milestoneType": self.types()["milestone"], "subGoals": [], "workItems": [],
        }
        batch = build("return { ...commands.createBatch(form), check: true };", form=form)
        reply = post(self.proc, self.port, "/api/commands", batch, self.auth)
        answer = json.loads(reply.body)
        self.assertEqual(reply.status, 422, answer)
        found = build("return commands.refusals(answer, batch);", answer=answer, batch=batch)
        self.assertEqual({v["place"] for v in found}, {"goal"})
        self.assertGreaterEqual(len(found), 2, found)

    def test_a_refused_milestone_leaves_the_rest_as_checks_to_come(self) -> None:
        options = self.read("/api/options")
        form = {
            "summary": "Open the second office", "description": "", "owner": "chelsea", "priority": options["priorities"][0]["id"],
            "due_date": "2027-05-01", "date_type": "Fantasy", "health": "GREEN", "path_to_green": None, "plan": None, "plan_maturity": options["defaults"]["plan_maturity"],
            "more": {k: options["defaults"][k] for k in ("type", "severity", "state", "origination", "level", "visibility", "org_unit")},
            "milestone": {"summary": "", "due_date": "2026-12-01", "owner": "chelsea"},
            "milestoneType": self.types()["milestone"], "subGoals": [], "workItems": [],
        }
        batch = build("return { ...commands.createBatch(form), check: true };", form=form)
        answer = json.loads(post(self.proc, self.port, "/api/commands", batch, self.auth).body)
        got = build("return [commands.refusals(answer, batch).map((v) => v.place), commands.notChecked(answer)];", answer=answer, batch=batch)
        self.assertEqual(got[0], ["milestone"])
        self.assertGreater(got[1], 0)

    def test_a_new_goal_under_a_parent_saves_with_the_parents_date(self) -> None:
        options = self.read("/api/options")
        form = {
            "summary": "Write the help text for the export", "description": "", "owner": "chelsea", "priority": None, "due_date": "", "date_type": "",
            "health": None, "path_to_green": None, "plan": None, "plan_maturity": options["defaults"]["plan_maturity"],
            "more": {**{k: options["defaults"][k] for k in ("type", "severity", "origination", "level", "visibility", "org_unit")}, "state": "Backlog"},
            "milestone": None, "milestoneType": self.types()["milestone"], "parent": "XW-0004", "subGoals": [], "workItems": [],
        }
        key = self.send(build("return commands.createBatch(form);", form=form))["ids"]["$goal"]
        goal = self.read(f"/api/goals/{key}")["goal"]
        self.assertEqual((goal["parent"], goal["due_date"], goal["date_type"]), ("XW-0004", None, None))

    def test_health_with_a_path_to_green_is_stored(self) -> None:
        goal = self.read("/api/goals/XW-0003")["goal"]
        ptg = {"steps": [{"text": "Load the tree", "owner": "chelsea", "date": "2026-10-30"}], "criteria": "The tree is loaded", "trigger": "Not loaded by Nov 2"}
        self.assertTrue(self.send(build("return commands.healthBatch(goal, 'YELLOW', ptg, 'Seed is late');", goal=goal, ptg=ptg))["ok"])


    def test_promoting_fantasy_to_ambition_passes_the_server_check(self) -> None:
        page = self.read("/api/goals/XW-0003")
        pm = page["promotionMilestone"]
        ms = {"summary": "Commit a date for the MLP release", "due_date": "2026-11-20", "owner": "chelsea"}
        batch = build("return { ...commands.promoteToAmbition(goal, ms, '2026-11-30', 'Milestone met', type, met), check: true };", goal=page["goal"], ms=ms, type=self.types()["milestone"], met={k: pm[k] for k in ("id", "version", "state")})
        self.assertTrue(self.send(batch)["ok"])


    def test_promote_and_close_completes_an_ambition_goal_in_one_batch(self) -> None:
        options = self.read("/api/options")
        form = {
            "summary": "Ship the export", "description": "", "owner": "chelsea", "priority": options["priorities"][0]["id"],
            "due_date": "2027-03-01", "date_type": "Ambition", "health": "GREEN", "path_to_green": None, "plan": "https://docs.example/export", "plan_maturity": "Pencil",
            "more": {k: options["defaults"][k] for k in ("type", "severity", "state", "origination", "level", "visibility", "org_unit")} | {"state": "In Progress"},
            "milestone": {"summary": "Commit a date for the export", "due_date": "2026-12-01", "owner": "chelsea"},
            "milestoneType": self.types()["milestone"], "subGoals": [], "workItems": [],
        }
        key = self.send(build("return commands.createBatch(form);", form=form))["ids"]["$goal"]
        page = self.read(f"/api/goals/{key}")
        pm = page["promotionMilestone"]
        self.assertEqual(page["closesAsPromoted"], "Completed")
        self.assertEqual(self.read(f"/api/goals/{pm['id']}")["goal"]["health"], "GREEN")
        self.assertEqual(pm["state"], "In Progress")
        batch = build("return commands.promoteAndClose(goal, met, state, 'Shipped');", goal=page["goal"], state=page["closesAsPromoted"], met={k: pm[k] for k in ("id", "version", "state")})
        self.assertTrue(self.send(batch)["ok"])
        goal = self.read(f"/api/goals/{key}")["goal"]
        self.assertEqual((goal["date_type"], goal["state"], goal["promotion_milestone"]), ("Committed", "Completed", None))

    def test_the_fields_and_description_panels_save_with_a_reason(self) -> None:
        goal = self.read("/api/goals/XW-0004")["goal"]
        batch = build("return commands.fieldsBatch(goal, { description: 'The MLP running with real goals.', severity: 'sev2' }, 'Wrote it down');", goal=goal)
        self.assertTrue(self.send(batch)["ok"])

    def test_a_panel_saved_with_no_reason_is_refused_at_the_reason(self) -> None:
        goal = self.read("/api/goals/XW-0004")["goal"]
        batch = build("return commands.fieldsBatch(goal, { severity: 'sev3' }, '');", goal=goal)
        reply = post(self.proc, self.port, "/api/commands", batch, self.auth)
        answer = json.loads(reply.body)
        self.assertEqual(reply.status, 422, answer)
        self.assertEqual([v["field"] for v in answer["violations"]], ["reason"])


    def test_a_goal_chelsea_may_not_change_reads_only_and_refuses_her_save(self) -> None:
        page = self.read("/api/goals/XW-0002")
        self.assertFalse(page["mayChange"])
        names = [page["actors"][c["actor"]]["name"] for c in page["changers"]]
        self.assertIn("Tig", names)
        reply = post(self.proc, self.port, "/api/commands", build("return commands.fieldsBatch(goal, { severity: 'sev3' }, 'Tidy');", goal=page["goal"]), self.auth)
        answer = json.loads(reply.body)
        self.assertEqual((reply.status, [v["rule"] for v in answer["violations"]]), (422, ["owners-change-goal"]))

    def test_a_goal_chelsea_owns_lets_her_change_it(self) -> None:
        self.assertTrue(self.read("/api/goals/XW-0004")["mayChange"])

if __name__ == "__main__":
    unittest.main()
