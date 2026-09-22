import json
import requests
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/live":
            self.handle_live(parsed)
        else:
            super().do_GET()

    def handle_live(self, parsed):
        params = parse_qs(parsed.query)

        try:
            lat = float(params["lat"][0])
            lon = float(params["lon"][0])
        except (KeyError, ValueError, TypeError):
            self.send_json({"error": "lat and lon are required"}, 400)
            return

        url = (
            f"https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/100"
        )

        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            self.send_json(response.json())

        except requests.RequestException as error:
            self.send_json(
                {"error": f"ADSB.lol request failed: {error}"},
                502
            )

        except ValueError:
            self.send_json(
                {"error": "Invalid JSON returned by ADSB.lol"},
                502
            )

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)

    print("GPS Jamming Map server running on port 8000")
    print("Live ADSB proxy: /api/live?lat=...&lon=...")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
