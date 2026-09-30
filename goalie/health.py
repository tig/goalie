"""HTTP health check. No other route."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

# json.dumps inserts a space after the colon. The response is these bytes.
BODY = b'{"status":"ok"}\n'


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path != "/health":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)

    def log_message(self, format: str, *args: Any) -> None:
        return


def bind(host: str, port: int) -> HTTPServer:
    return HTTPServer((host, port), HealthHandler)


def serve(host: str, port: int) -> None:
    bind(host, port).serve_forever()
