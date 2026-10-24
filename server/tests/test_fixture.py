"""The app's fixtures in web/fixtures/ are what the API answers for the seed (review E9, plan B3).

Run `python server/tests/test_fixture.py --write` to regenerate them after a contract change.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from goalie_cli import SERVER

TODAY = "2026-10-23"
FIXTURES = SERVER / "web" / "fixtures"

# Freeze the clock at noon UTC on TODAY, seed a fresh store, and build each response as Chelsea sees it.
PROBE = """
const fixed = Date.parse(process.argv[1] + "T12:00:00Z");
const Real = Date;
globalThis.Date = class extends Real {
  constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
  static now() { return fixed; }
};
const { readFileSync } = await import("node:fs");
const { openStore } = await import("./src/store.ts");
const { seed } = await import("./src/seed.ts");
const { prioritiesView } = await import("./src/priorities.ts");
const { goalPage } = await import("./src/goalpage.ts");
const { formOptions } = await import("./src/options.ts");
const { workQueue } = await import("./src/work.ts");
const today = process.argv[1];
const db = openStore(process.argv[2]);
const seeded = seed(db, JSON.parse(readFileSync("seed/excaliwire.json", "utf-8")), today);
if (!seeded.ok) throw new Error(JSON.stringify(seeded));
// The dev fixtures show our build team's queues too.
const team = seed(db, JSON.parse(readFileSync("seed/build-team.json", "utf-8")), today);
if (!team.ok) throw new Error(JSON.stringify(team));
const me = { id: "chelsea", name: "Chelsea" };
process.stdout.write(JSON.stringify({
  "priorities.json": { ...prioritiesView(db, "excaliwire", today, "UTC"), me },
  "goal-XW-0001.json": goalPage(db, "XW-0001", me.id, today, "UTC"),
  "goal-XW-0003.json": goalPage(db, "XW-0003", me.id, today, "UTC"),
  "goal-XW-0004.json": goalPage(db, "XW-0004", me.id, today, "UTC"),
  "goal-XW-0007.json": goalPage(db, "XW-0007", me.id, today, "UTC"),
  "options.json": formOptions(db, me.id, "excaliwire", today),
  "work.json": workQueue(db, me.id, today),
}));
"""


def built() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as scratch:
        proc = subprocess.run(
            ["node", "--no-warnings", "--input-type=module", "-e", PROBE, TODAY, str(Path(scratch) / "goalie.db")],
            cwd=SERVER, capture_output=True, timeout=30,
        )
    if proc.returncode != 0:
        raise AssertionError(proc.stderr.decode())
    return json.loads(proc.stdout)


class FixtureTests(unittest.TestCase):
    def test_each_fixture_is_the_seed_response(self) -> None:
        for name, answer in built().items():
            with self.subTest(fixture=name):
                fixture = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
                self.assertEqual(fixture, answer, f"{name} differs from the API. Run: python server/tests/test_fixture.py --write")


if __name__ == "__main__":
    if "--write" in sys.argv:
        for name, answer in built().items():
            (FIXTURES / name).write_text(json.dumps(answer, indent=2) + "\n", encoding="utf-8")
            print(f"wrote {name}")
    else:
        unittest.main()
