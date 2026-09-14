#!/usr/bin/env python3
"""PROTOTYPE — throwaway. Serves the repository root over HTTP.

The prototype cannot run from a file:// URL, because a WebAssembly engine and
a web worker both need a real origin. This is a plain static server with two
extra response headers, so the worker can use SharedArrayBuffer.

Run it from the repository root:

    python3 web/prototype-engine-check/serve.py

Then open http://localhost:8321/web/app/, or
http://localhost:8321/web/prototype-engine-check/ for the walkthrough
probe this file serves.
"""

import functools
import http.server
import os
import socketserver
import sys

PORT = 8321
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Only the engine payload is cached. Everything else must not be,
        # or an edit to the page is invisible until the browser profile is
        # cleared. Note that a directory index does not end in ".html", so
        # the test is on what may be cached, never on what may not.
        cacheable = self.path.endswith((".data", ".wasm")) or "/busytex/" in self.path
        self.send_header("Cache-Control", "public, max-age=3600" if cacheable else "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    """Threading matters: the worker pulls a 192 MB data package while the page
    is still fetching. A single-threaded server serializes the two and the
    engine's 120 second initialization timeout expires."""

    allow_reuse_address = True
    daemon_threads = True


with Server(("", PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print(f"Serving {ROOT} on http://localhost:{PORT}/web/prototype-engine-check/")
    httpd.serve_forever()
