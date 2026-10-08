"""Static server for development: like `python3 -m http.server`, but every response says no-cache.

Browsers otherwise reuse an ES module they fetched earlier without asking, so an edited file only
shows up after a hard reload. With no-cache they revalidate each file and get a 304 when it is unchanged.
"""
import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Serving on http://127.0.0.1:{server.server_address[1]}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
