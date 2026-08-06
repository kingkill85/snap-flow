#!/usr/bin/env python3
import argparse
import http.client
import json
import os
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from neo_dev_webhook.automation import PublicGitHubAdapter, Receiver, Store


class LimitedHeaderReader:
    def __init__(self, raw, *, line_limit, total_limit):
        self.raw = raw
        self.line_limit = line_limit
        self.total_limit = total_limit
        self.total = 0

    def readline(self, limit=-1):
        effective = self.line_limit + 1
        if limit >= 0:
            effective = min(effective, limit)
        line = self.raw.readline(effective)
        self.total += len(line)
        if len(line) > self.line_limit:
            raise http.client.LineTooLong("individual header")
        if self.total > self.total_limit:
            raise http.client.LineTooLong("aggregate headers")
        return line

    def __getattr__(self, name):
        return getattr(self.raw, name)


class HeaderLimitHandlerMixin:
    header_line_limit = 1024
    header_total_limit = 16 * 1024

    def parse_request(self):
        raw = self.rfile
        self.rfile = LimitedHeaderReader(
            raw,
            line_limit=self.header_line_limit,
            total_limit=self.header_total_limit,
        )
        try:
            return super().parse_request()
        finally:
            self.rfile = raw


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """Reject excess connections before a handler thread can read a request body."""

    daemon_threads = True

    def __init__(self, server_address, handler_class, *, concurrency_limit=8, read_timeout=5.0):
        if concurrency_limit < 1:
            raise ValueError("concurrency_limit must be positive")
        if read_timeout <= 0:
            raise ValueError("read_timeout must be positive")
        self._admission = threading.BoundedSemaphore(concurrency_limit)
        self._read_timeout = read_timeout
        super().__init__(server_address, handler_class)

    def process_request(self, request, client_address):
        request.settimeout(self._read_timeout)
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

    @staticmethod
    def _expire_request(request):
        try:
            request.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            request.close()
        except OSError:
            pass

    def process_request_thread(self, request, client_address):
        deadline = threading.Timer(
            self._read_timeout,
            self._expire_request,
            args=(request,),
        )
        deadline.daemon = True
        deadline.start()
        try:
            super().process_request_thread(request, client_address)
        finally:
            deadline.cancel()
            self._admission.release()

    def handle_error(self, request, client_address):
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def main():
    parser = argparse.ArgumentParser(description="Standalone SnapFlow Neo Dev webhook receiver")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--concurrency-limit", type=int, default=8)
    parser.add_argument("--read-timeout", type=float, default=5.0)
    args = parser.parse_args()
    secret = os.environ.get("NEO_DEV_WEBHOOK_SECRET")
    database = os.environ.get("NEO_DEV_WEBHOOK_DB")
    if not secret or not database:
        parser.error("NEO_DEV_WEBHOOK_SECRET and NEO_DEV_WEBHOOK_DB are required")
    receiver = Receiver(secret, Store(database), PublicGitHubAdapter())

    class Handler(HeaderLimitHandlerMixin, BaseHTTPRequestHandler):
        header_line_limit = receiver.limits.header_bytes
        header_total_limit = receiver.limits.total_header_bytes
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
        read_timeout=args.read_timeout,
    ).serve_forever()


if __name__ == "__main__":
    main()
