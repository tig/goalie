#!/usr/bin/env python3
"""Report whether a component's inputs are among the paths on stdin.

Writes affected=true or affected=false to GITHUB_OUTPUT when that variable
is set. Otherwise prints true or false.
"""

from __future__ import annotations

import os
import sys

# Paths outside the component folder are inputs. Keep this list in order.
COMPONENTS = {
    "server": [
        "server/**",
        ".github/workflows/server.yml",
        ".github/scripts/ci_affected.py",
    ],
    "tests": [
        "tests/**",
        "SPEC.md",
        "USERS_MANUAL.md",
        "docs/**",
        "CONTRIBUTING.md",
        ".github/workflows/server.yml",
        ".github/workflows/tests.yml",
        ".github/workflows/guidance.yml",
        ".github/scripts/ci_affected.py",
    ],
    "guidance": [
        "guidance/**",
        "AGENTS.md",
        ".github/scripts/agent_forms.py",
        ".github/workflows/guidance.yml",
        ".github/scripts/ci_affected.py",
    ],
}


def matches(pattern: str, path: str) -> bool:
    if pattern.endswith("/**"):
        prefix = pattern[:-3]
        return path == prefix or path.startswith(prefix + "/")
    return path == pattern


def affected(component: str, files: list[str]) -> bool:
    patterns = COMPONENTS[component]
    return any(matches(pattern, path) for path in files for pattern in patterns)


def main() -> int:
    component = sys.argv[1]
    files = [line.strip().replace("\\", "/") for line in sys.stdin if line.strip()]
    flag = "true" if affected(component, files) else "false"
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8", newline="\n") as handle:
            handle.write(f"affected={flag}\n")
    else:
        print(flag)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
