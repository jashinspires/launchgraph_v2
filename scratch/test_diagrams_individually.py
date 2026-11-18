import urllib.request
import urllib.error
import base64
import zlib
import json

from render_all_diagrams import DIAGRAMS

for name, code in DIAGRAMS.items():
    state = {"code": code}
    compressed = zlib.compress(json.dumps(state).encode("utf-8"), 9)
    enc = base64.urlsafe_b64encode(compressed).decode("ascii")
    url = f"https://mermaid.ink/img/pako:{enc}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            print(f"[{name}] OK ({len(data)} bytes)")
    except urllib.error.HTTPError as e:
        print(f"[{name}] HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')}")
    except Exception as e:
        print(f"[{name}] Other Error: {e}")
