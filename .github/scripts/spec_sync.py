#!/usr/bin/env python3
"""Exit 1 when a GOALIE behavior change omits SPEC.md.

A path under goalie/ is behavior, except goalie/__main__.py and goalie/health.py.
Those two are infrastructure.
Pass changed paths as arguments, or on stdin, one path per line, encoded as UTF-8.
"""

from __future__ import annotations

import sys

INFRASTRUCTURE = frozenset({"goalie/__main__.py", "goalie/health.py"})


def needs_spec(changed: list[str]) -> bool:
    """True when behavior changed and SPEC.md is not in the same change."""
    if "SPEC.md" in changed:
        return False
    return any(path.startswith("goalie/") and path not in INFRASTRUCTURE for path in changed)


def changed_paths(argv: list[str]) -> list[str]:
    if argv:
        return argv
    raw = sys.stdin.buffer.read().decode("utf-8")
    return [line.strip() for line in raw.splitlines() if line.strip()]


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if needs_spec(changed_paths(argv)):
        print(
            "A goalie/ behavior change must include SPEC.md in the same pull request.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
