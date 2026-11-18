import urllib.request
import urllib.error
import base64
import zlib
import json

code = """flowchart TB
    A --> B
"""

# Let's test with raw code base64:
# In mermaid.ink:
# https://mermaid.ink/img/{base64}
# or https://mermaid.ink/svg/{base64}
raw_b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
url1 = f"https://mermaid.ink/img/{raw_b64}"

state = {"code": code}
compressed = zlib.compress(json.dumps(state).encode("utf-8"), 9)
enc = base64.urlsafe_b64encode(compressed).decode("ascii")
url2 = f"https://mermaid.ink/img/pako:{enc}"

print("URL1:", url1)
print("URL2:", url2)

for name, u in [("raw", url1), ("pako", url2)]:
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f"[{name}] SUCCESS: {len(r.read())}")
    except urllib.error.HTTPError as e:
        print(f"[{name}] HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')}")
