#!/usr/bin/env python3
import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from neo_dev_webhook.automation import PublicGitHubAdapter, Receiver, Store


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """Reject excess connections before a handler thread can read a request body."""

    daemon_threads = True

    def __init__(self, server_address, handler_class, *, concurrency_limit=8):
        if concurrency_limit < 1:
            raise ValueError("concurrency_limit must be positive")
        self._admission = threading.BoundedSemaphore(concurrency_limit)
        super().__init__(server_address, handler_class)

    def process_request(self, request, client_address):
        if not self._admission.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Connection: close\r\nContent-Length: 0\r\n\r\n"
                )
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._admission.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._admission.release()


def main():
    parser = argparse.ArgumentParser(description="Standalone SnapFlow Neo Dev webhook receiver")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--concurrency-limit", type=int, default=8)
    args = parser.parse_args()
    secret = os.environ.get("NEO_DEV_WEBHOOK_SECRET")
    database = os.environ.get("NEO_DEV_WEBHOOK_DB")
    if not secret or not database:
        parser.error("NEO_DEV_WEBHOOK_SECRET and NEO_DEV_WEBHOOK_DB are required")
    receiver = Receiver(secret, Store(database), PublicGitHubAdapter())

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/github-webhook":
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                length = -1
            if length < 0 or length > receiver.limits.body_bytes:
                self.send_error(413)
                return
            status, result = receiver.handle(dict(self.headers), self.rfile.read(length))
            body = json.dumps({"status": result}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            return

    BoundedThreadingHTTPServer(
        (args.host, args.port), Handler,
        concurrency_limit=args.concurrency_limit,
    ).serve_forever()


if __name__ == "__main__":
    main()
