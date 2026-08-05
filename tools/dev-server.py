"""Local dev server for Roguidle.

Plain `python -m http.server` lets the browser cache ES modules, so after
editing src/sim/*.js you can end up tuning against code you are not actually
running. This serves the repo with caching switched off.

    python tools/dev-server.py [port]

Then open http://localhost:8137/run-sim.html
Nothing in the game depends on this file — GitHub Pages serves the repo as-is.
"""

import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Roguidle dev server: http://localhost:{PORT}/run-sim.html")
        httpd.serve_forever()
