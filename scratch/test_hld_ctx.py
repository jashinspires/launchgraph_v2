import urllib.request
import urllib.error
import base64
import zlib
import json

code = """flowchart TB
    subgraph ExternalSources["External Source Systems"]
        Jira["Jira Cloud (OAuth 2.0 3LO & Webhooks)"]
        GitHub["GitHub App (Webhooks & Releases)"]
        Slack["Slack Workspace (Events API & Interactivity)"]
    end

    subgraph LaunchGraphPlatform["LaunchGraph V1 Core Platform"]
        Ingester["Ingestion Service (:8001)"]
        Normalizer["Normalizer Service (:8002)"]
        Decisioner["Decisioner Service (:8003)"]
        Generator["Generator Service (:8004)"]
        DashboardSvc["Dashboard API Service (:8005)"]
        A2A["A2A Interface Service (:8006)"]
        Postgres[("PostgreSQL 16 + pgvector")]
    end

    subgraph ExternalLLM["Foundation Model Providers"]
        Claude["Anthropic Claude Opus 5 / Sonnet 5"]
    end

    subgraph DownstreamConsumers["Downstream Consumers"]
        HumanReviewers["GTM Reviewers & PMMs (Dashboard UI)"]
        SlackApprovers["Slack Reviewers (Interactive Blocks)"]
        A2AAgents["Downstream Autonomous AI Agents (A2A API)"]
    end

    Jira -->|Webhooks / Polling| Ingester
    GitHub -->|Webhooks / Deliveries| Ingester
    Slack -->|Events API / Actions| Ingester

    Ingester -->|Write raw source events| Postgres
    Normalizer <-->|Read events / Write graph| Postgres
    Decisioner <-->|Read graph / Write candidates| Postgres
    Generator <-->|Read candidates / Write packs| Postgres
    DashboardSvc <-->|Read & Update approval state| Postgres
    A2A <-->|Read approved launch records| Postgres

    Decisioner -->|k=3 Judgment Sampling| Claude
    Generator -->|Context Assembly & Writer| Claude

    DashboardSvc -->|GraphQL / REST| HumanReviewers
    DashboardSvc -->|Block Kit Actions| SlackApprovers
    A2A -->|OpenAPI 3.1 & A2A Skills| A2AAgents"""

state = {"code": code}
compressed = zlib.compress(json.dumps(state).encode("utf-8"), 9)
enc = base64.urlsafe_b64encode(compressed).decode("ascii")
url = f"https://mermaid.ink/img/pako:{enc}?bgColor=!white"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        data = r.read()
        print(f"SUCCESS: bytes {len(data)}")
        with open("resources/images/hld_system_context.png", "wb") as f:
            f.write(data)
        print("Wrote resources/images/hld_system_context.png")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode('utf-8', errors='ignore')}")
