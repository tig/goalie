"""Start the server process on a free port and read one path."""

from __future__ import annotations

import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

SERVER = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Reply:
    status: int
    content_type: str
    body: bytes


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def read_stderr(proc: subprocess.Popen[bytes]) -> str:
    # The pipe stays open while the process is alive. Kill before reading.
    if proc.poll() is None:
        proc.kill()
        proc.wait(timeout=5)
    if proc.stderr is None:
        return ""
    return proc.stderr.read().decode("utf-8", errors="replace")


@contextmanager
def running_server() -> Iterator[tuple[subprocess.Popen[bytes], int]]:
    """Yield the process and its port. Stop the process on exit."""
    port = free_port()
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["HOST"] = "127.0.0.1"
    proc = subprocess.Popen(
        ["node", "src/server.ts"],
        cwd=SERVER,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        yield proc, port
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        if proc.stdout:
            proc.stdout.close()
        if proc.stderr:
            proc.stderr.close()


def get(proc: subprocess.Popen[bytes], port: int, path: str) -> Reply:
    """GET path. Retry until the server listens. Raise AssertionError on failure."""
    last_error = ""
    for _ in range(50):
        if proc.poll() is not None:
            err = read_stderr(proc)
            raise AssertionError(f"process exited {proc.returncode}\n{err}")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=0.2) as response:
                return Reply(response.status, response.headers.get("Content-Type", ""), response.read())
        except urllib.error.HTTPError as error:
            return Reply(error.code, error.headers.get("Content-Type", ""), error.read())
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = str(error)
            time.sleep(0.05)
    stderr = read_stderr(proc)
    raise AssertionError(f"{path} did not answer: {last_error}\n{stderr}")
