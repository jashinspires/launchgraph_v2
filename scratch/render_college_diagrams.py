import os
import urllib.request
import base64
import time

COLLEGE_DIAGRAMS = {
    "guide_milestone_pie": {
        "title": "30% Completed Implementation Distribution",
        "code": """pie title 30% Completed Implementation Distribution
    "Batch 0: Core Models, Migrations & Contracts (10%)" : 10
    "Milestone M1: Live Ingestion Pipeline & Hygiene (15%)" : 15
    "Milestone M2 Core: Normalization & Graph Ledger (5%)" : 5"""
    },
    
    "guide_ingestion_pipeline": {
        "title": "Milestone M1: Live Ingestion Pipeline Flowchart",
        "code": """flowchart TD
    Payload[Inbound Webhook Payload] --> Verify{HMAC Signature Valid?}
    Verify -->|No| Reject[401 Unauthorized]
    Verify -->|Yes| Dedupe{Idempotency Key in webhook_inbox?}
    Dedupe -->|Duplicate| AckDup[200 OK: Duplicate Acknowledged]
    Dedupe -->|New| Inbox[Write raw payload to webhook_inbox]
    Inbox --> Scrub[Run SecretScrubber Engine]
    Scrub --> SourceEvent[Insert scrubbed event into source_events]
    SourceEvent --> Ack[200 OK: Accepted for Normalization]"""
    },
    
    "guide_normalization_pipeline": {
        "title": "Milestone M2 Core: Context Graph Normalization Flowchart",
        "code": """flowchart TD
    SE[source_event: Raw Ingested Event] --> Extractor[Reference Extractor]
    Extractor --> Refs[Jira Keys, PR Numbers, Commit SHAs]
    Refs --> LinkType[Link Typing Engine: L1-L8]
    LinkType --> Anchor[Anchor Resolution Hierarchy]
    Anchor --> CE[ChangeEvent: Primary Change Entity]
    CE --> Ledger[Append-Only Ledger: change_membership]
    Ledger --> Life[Lifecycle State Machine: in_progress -> merged]"""
    },
    
    "guide_implementation_gantt": {
        "title": "LaunchGraph V1 Implementation Plan & Roadmap",
        "code": """gantt
    title LaunchGraph V1 Implementation Plan (Remaining 70%)
    dateFormat  X
    axisFormat %s%%
    
    section Completed (30%)
    Batch 0 Contracts & DB Schema :done, 0, 10
    Wave 1 Ingestion Pipeline (M1) :done, 10, 25
    Wave 2 Normalization Core (M2) :done, 25, 30
    
    section Remaining (70%)
    Wave 2 Graph Completion (M2)   :active, 30, 40
    Wave 3A Decisioning Engine     : 40, 55
    Wave 3B Generation & Linters   : 55, 70
    Wave 4A Review UI & Mem0 Engine: 70, 80
    Wave 4B A2A Protocol & Egress  : 80, 90
    Wave 5 Pilot Gate & GA Hardening: 90, 100"""
    }
}

out_dir = os.path.join(os.path.dirname(__file__), "..", "resources", "images")
os.makedirs(out_dir, exist_ok=True)

for name, meta in COLLEGE_DIAGRAMS.items():
    code = meta["code"]
    raw_b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
    
    png_url = f"https://mermaid.ink/img/{raw_b64}"
    req_png = urllib.request.Request(png_url, headers={"User-Agent": "Mozilla/5.0"})
    png_path = os.path.join(out_dir, f"{name}.png")
    
    try:
        with urllib.request.urlopen(req_png, timeout=15) as resp:
            data = resp.read()
            with open(png_path, "wb") as f:
                f.write(data)
            print(f"  [OK] {name}.png ({len(data)} bytes)")
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
    time.sleep(0.3)

print("College diagrams rendered successfully.")
