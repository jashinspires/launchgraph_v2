import urllib.request
import urllib.error
import base64
import zlib
import json

code = "flowchart TD\n    A-->B"
state = {"code": code}
compressed = zlib.compress(json.dumps(state).encode("utf-8"), 9)
enc = base64.urlsafe_b64encode(compressed).decode("ascii")

urls = [
    ("plain pako", f"https://mermaid.ink/img/pako:{enc}"),
    ("with bgColor", f"https://mermaid.ink/img/pako:{enc}?bgColor=white"),
    ("with !bgColor", f"https://mermaid.ink/img/pako:{enc}?bgColor=!white"),
    ("with scale", f"https://mermaid.ink/img/pako:{enc}?scale=2"),
    ("raw b64 plain", f"https://mermaid.ink/img/{base64.b64encode(code.encode('utf-8')).decode('ascii')}"),
    ("raw b64 with scale", f"https://mermaid.ink/img/{base64.b64encode(code.encode('utf-8')).decode('ascii')}?scale=2"),
]

for name, u in urls:
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            print(f"[{name}] SUCCESS: status {r.status}, len {len(r.read())}")
    except urllib.error.HTTPError as e:
        print(f"[{name}] HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')}")
