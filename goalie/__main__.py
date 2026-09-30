"""Run the empty service until the process stops."""

from __future__ import annotations

import os

from goalie.health import serve


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    serve("0.0.0.0", port)


if __name__ == "__main__":
    main()
