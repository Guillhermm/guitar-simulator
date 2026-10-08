"""Static server for development: like `python3 -m http.server`, but nothing is ever cached.

Browsers otherwise reuse an ES module they fetched earlier without asking, so an edited file only
shows up after a hard reload, and a module cached from another project served on the same port can
load in its place. no-store keeps every file out of the cache; the project also has a port of its own.
"""
import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8417
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving on http://127.0.0.1:{server.server_address[1]}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
