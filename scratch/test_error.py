import urllib.request
import urllib.error
import base64
import zlib
import json

code = """flowchart TD
    subgraph S1["Stage 1"]
        A --> B
    end
"""

state = {"code": code, "mermaid": {"theme": "default"}}
compressed = zlib.compress(json.dumps(state).encode("utf-8"), 9)
# Note: In mermaid.ink pako encoding, how is base64 formatted?
# Let's check raw base64 vs urlsafe base64 vs base64 without padding!
enc_std = base64.b64encode(compressed).decode("ascii")
enc_url = base64.urlsafe_b64encode(compressed).decode("ascii")

for mode, enc in [("std", enc_std), ("url", enc_url)]:
    url = f"https://mermaid.ink/img/pako:{enc}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Mode {mode} status: {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"Mode {mode} error {e.code}: {e.read().decode('utf-8', errors='ignore')}")

# Also test raw code (without pako, just standard base64 of the mermaid text)
enc_code = base64.b64encode(code.encode("utf-8")).decode("ascii")
url_code = f"https://mermaid.ink/img/{enc_code}"
req_code = urllib.request.Request(url_code, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req_code) as resp:
        print(f"Raw code status: {resp.status}, len: {len(resp.read())}")
except urllib.error.HTTPError as e:
    print(f"Raw code error {e.code}: {e.read().decode('utf-8', errors='ignore')}")
