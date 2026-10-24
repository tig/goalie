"""Run the local CLI (src/cli.ts) against a temporary SQLite file."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SERVER = Path(__file__).resolve().parents[1]


class Store:
    """One temporary GOALIE_DB. Call close() when done."""

    def __init__(self) -> None:
        self._scratch = tempfile.TemporaryDirectory()
        self.path = Path(self._scratch.name) / "goalie.db"

    def close(self) -> None:
        self._scratch.cleanup()

    def run(self, *args: str, stdin: Any = None, env: dict[str, str] | None = None) -> tuple[int, Any]:
        """Run one CLI command. Return the exit code and the parsed JSON it printed."""
        full_env = os.environ.copy()
        full_env["GOALIE_DB"] = str(self.path)
        full_env.update(env or {})
        proc = subprocess.run(
            ["node", "--no-warnings", "src/cli.ts", *args],
            cwd=SERVER,
            env=full_env,
            input=None if stdin is None else json.dumps(stdin).encode("utf-8"),
            capture_output=True,
            timeout=30,
        )
        out = proc.stdout.decode("utf-8")
        if not out.strip():
            raise AssertionError(f"cli {args} printed nothing, exit {proc.returncode}\n{proc.stderr.decode()}")
        return proc.returncode, json.loads(out)

    def write(self, actor: str, command: dict[str, Any]) -> Any:
        """Write through the one write path as actor. Return the result."""
        return self.run("write", "--as", actor, stdin=command)[1]

    def read(self, kind: str, entity: str) -> Any:
        return self.run("read", kind, entity)[1]

    def events(self, after: int = 0) -> list[dict[str, Any]]:
        return self.run("events", str(after))[1]


def create(kind: str, entity: str, fields: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    command: dict[str, Any] = {"op": "create", "kind": kind, "id": entity, "fields": fields}
    if reason is not None:
        command["reason"] = reason
    return command


def update(kind: str, entity: str, base_version: int, fields: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
    command: dict[str, Any] = {"op": "update", "kind": kind, "id": entity, "base_version": base_version, "fields": fields}
    if reason is not None:
        command["reason"] = reason
    return command
