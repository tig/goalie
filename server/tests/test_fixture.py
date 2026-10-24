"""The app's fixture, web/fixtures/priorities.json, is what the API answers for the seed (review E9)."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from goalie_cli import SERVER

TODAY = "2026-10-23"

# Freeze the clock at noon UTC on TODAY, seed a fresh store, and build the response as Chelsea sees it.
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
const db = openStore(process.argv[2]);
const seeded = seed(db, JSON.parse(readFileSync("seed/excaliwire.json", "utf-8")));
if (!seeded.ok) throw new Error(JSON.stringify(seeded));
process.stdout.write(JSON.stringify({ ...prioritiesView(db, "excaliwire", new Date()), me: { id: "chelsea", name: "Chelsea" } }));
"""


class FixtureTests(unittest.TestCase):
    def test_the_fixture_is_the_seed_response(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            proc = subprocess.run(
                ["node", "--no-warnings", "--input-type=module", "-e", PROBE, TODAY, str(Path(scratch) / "goalie.db")],
                cwd=SERVER, capture_output=True, timeout=30,
            )
        self.assertEqual(proc.returncode, 0, proc.stderr.decode())
        built = json.loads(proc.stdout)
        fixture = json.loads((SERVER / "web" / "fixtures" / "priorities.json").read_text(encoding="utf-8"))
        self.assertEqual(fixture["today"], TODAY)
        self.assertEqual(fixture, built)


if __name__ == "__main__":
    unittest.main()
