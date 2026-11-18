import os
import urllib.request
import base64
import time

DIAGRAMS = {
    # 1. HLD System Context
    "hld_system_context": {
        "title": "LaunchGraph System Context & Microservices Topology",
        "code": """flowchart TB
    subgraph ExternalSources["External Source Systems"]
        Jira["Jira Cloud (OAuth 2.0 3LO and Webhooks)"]
        GitHub["GitHub App (Webhooks and Releases)"]
        Slack["Slack Workspace (Events API and Interactivity)"]
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
        HumanReviewers["GTM Reviewers and PMMs (Dashboard UI)"]
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
    },

    # 2. HLD Five-Stage Processing Pipeline
    "hld_processing_pipeline": {
        "title": "Five-Stage Processing Pipeline (Stages 1 through 6)",
        "code": """flowchart TD
    subgraph S1Details["Stage 1: Ingestion (:8001)"]
        direction TB
        WH[Inbound Webhook Inbox] --> Dedupe[Deduplication and Secret Scrubbing]
        Dedupe --> SE[(source_events)]
    end

    subgraph S2Details["Stage 2: Normalization (:8002)"]
        direction TB
        Refs[Reference Extraction] --> Anchors[Anchor Resolution Hierarchy]
        Anchors --> Ledger[(change_membership)]
        Ledger --> CE[(change_events)]
    end

    subgraph S3Details["Stage 3: Decisioning (:8003)"]
        direction TB
        Facts[Deterministic Facts] --> Evidence[Evidence Pack 12k Cap]
        Evidence --> Judgment[Claude Opus Judgment Q1-Q9]
        Judgment --> Policy[Policy Engine P-Rules]
        Policy --> LC[(launch_candidates)]
    end

    subgraph S4Details["Stage 4: Generation (:8004)"]
        direction TB
        Matrix[Asset Matrix T0-T3] --> ContextAssm[6-Block Context + Mem0]
        ContextAssm --> Writer[Writer LLM Engine]
        Writer --> Linters[14 Deterministic Linters]
        Linters --> GP[(gtm_packs)]
    end

    subgraph S5Details["Stage 5: Review & Memory (:8005)"]
        direction TB
        Review[UI / Slack Review with Reason Chips] --> Finalize[Atomic Finalization]
        Finalize --> LR[(launch_records)]
        LR --> Mem0Engine[Mem0 Graph Memory Engine]
    end

    subgraph S6Details["Stage 6: A2A Egress (:8006)"]
        direction TB
        EgressFilter[5-Stage Egress Filter Gate] --> ExternalAgents[Downstream AI Agents]
    end

    S1Details --> S2Details
    S2Details --> S3Details
    S3Details --> S4Details
    S4Details --> S5Details
    S5Details --> S6Details"""
    },

    # 3. HLD Safety Architecture
    "hld_safety_architecture": {
        "title": "LaunchGraph 6-Layer Defense-in-Depth Safety Architecture (L0 to L5)",
        "code": """flowchart TD
    subgraph L0["Layer 0: Ingestion Hygiene"]
        L0_1[HMAC Webhook Verification]
        L0_2[Secret and PII Redaction Regex]
        L0_3[Payload Minimization and TTL Drop]
    end

    subgraph L1["Layer 1: Graph Isolation"]
        L1_1[Postgres Row-Level Security]
        L1_2[Append-Only Membership Ledger]
        L1_3[Tenant Segregated Namespaces]
    end

    subgraph L2["Layer 2: Decisioning Safety"]
        L2_1[Deterministic Sensitivity Detectors]
        L2_2[Restrict-Only Policy Rules]
        L2_3[k=3 Judgment Consensus and Bounding]
    end

    subgraph L3["Layer 3: Generation Hard Gates"]
        L3_1[14 Deterministic Lint Rules]
        L3_2[Claim Verifier Citation Enforcement]
        L3_3[Token and Codename Blacklist Filter]
    end

    subgraph L4["Layer 4: Human Governance Gate"]
        L4_1[Mandatory Human Review on External Copy]
        L4_2[Dual Approvers on Tier 1 Launches]
        L4_3[Domain Sign-offs on Policy Hits]
    end

    subgraph L5["Layer 5: Egress Hard Gate (A2A)"]
        L5_1[API Key and Scope Validation]
        L5_2[5-Step Egress Filter Pipeline]
        L5_3[Retraction Propagation and Audit Log]
    end

    L0 --> L1 --> L2 --> L3 --> L4 --> L5"""
    },

    # 4. HLD ER Data Architecture
    "hld_data_architecture_er": {
        "title": "LaunchGraph Relational Entity Domains (34 Tables)",
        "code": """erDiagram
    workspaces ||--o{ brands : contains
    workspaces ||--o{ app_users : has
    workspaces ||--o{ brand_profiles : configures
    workspaces ||--o{ audience_segments : defines
    
    workspaces ||--o{ connections : configures
    connections ||--o{ webhook_inbox : receives
    connections ||--o{ source_events : yields
    source_events ||--o{ change_events : normalizes
    change_events ||--o{ change_membership : tracks
    change_events ||--o{ change_relations : links
    
    change_events ||--o| launch_candidates : evaluates
    launch_candidates ||--o{ decision_runs : executes
    launch_candidates ||--o| gtm_packs : generates
    gtm_packs ||--o{ gtm_assets : contains
    gtm_assets ||--o{ asset_revisions : versions
    gtm_assets ||--o{ lint_findings : checks
    gtm_assets ||--o{ approval_events : approves
    gtm_packs ||--o| launch_records : finalizes
    
    workspaces ||--o{ api_keys : issues
    workspaces ||--o{ audit_logs : records
    workspaces ||--o{ jobs : queues"""
    },

    # 5. HLD Deployment Architecture
    "hld_deployment_architecture": {
        "title": "Production Deployment Topology & Microservices Cluster",
        "code": """flowchart TB
    subgraph Host["Production Host / Container Cluster"]
        direction TB
        Nginx["Nginx Reverse Proxy / SSL Terminator (:443)"]
        
        subgraph AppServices["Application Microservices"]
            IngesterSvc["ingester (:8001)"]
            NormalizerSvc["normalizer (:8002)"]
            DecisionerSvc["decisioner (:8003)"]
            GeneratorSvc["generator (:8004)"]
            DashboardSvc["dashboard (:8005)"]
            A2ASvc["a2a_interface (:8006)"]
            FrontendSvc["dashboard-ui (:3000)"]
        end

        subgraph DataStores["Storage Layer"]
            PostgreSQL[("PostgreSQL 16 + pgvector (:5432)")]
            Volume["Encrypted Persistent Volume"]
        end
    end

    Nginx -->|/webhooks/*| IngesterSvc
    Nginx -->|/api/*| DashboardSvc
    Nginx -->|/v1/*| A2ASvc
    Nginx -->|/*| FrontendSvc

    IngesterSvc --> PostgreSQL
    NormalizerSvc --> PostgreSQL
    DecisionerSvc --> PostgreSQL
    GeneratorSvc --> PostgreSQL
    DashboardSvc --> PostgreSQL
    A2ASvc --> PostgreSQL
    PostgreSQL --> Volume"""
    },

    # 6. LLD Component Topology
    "lld_component_topology": {
        "title": "Component Topology and Process Boundaries",
        "code": """flowchart TD
    subgraph Core["Shared Foundation: launchgraph_core"]
        Models[SQLAlchemy 2.0 Async Models]
        DB[Database Session and Engine Pool]
        Config[Core Settings and Pydantic Contracts]
        Crypto[KMS and HMAC Hashing Utilities]
        Workers[SKIP LOCKED Worker Coordination]
        Mem0Engine[Mem0 Graph Operations]
    end

    subgraph Pipeline["Sequential Microservice Pipeline"]
        direction TB
        S1["1. Ingestion Service (:8001)<br/>• Webhook Receivers<br/>• SecretScrubber Redaction<br/>• Retention Purger"]
        S2["2. Normalizer Service (:8002)<br/>• Reference Extractor Jira/PR/SHA<br/>• Link Typing L1-L8<br/>• Append-Only Ledger Manager"]
        S3["3. Decisioner Service (:8003)<br/>• Sensitivity Detectors<br/>• Evidence Pack Assembler 12k<br/>• Claude Opus Judgment Q1-Q9"]
        S4["4. Generator Service (:8004)<br/>• 6-Block Context Assembler<br/>• 14 Deterministic Linters<br/>• LLM Claim Verifier Pass"]
        S5["5. Dashboard Service (:8005)<br/>• PMM Review & Triage API<br/>• Reason Chips & Diff Engine<br/>• Multi-Party Approval Rules"]
        S6["6. A2A Interface Service (:8006)<br/>• Agent-to-Agent REST API<br/>• 5-Step Egress Filter Gate<br/>• Retraction Event Stream"]

        S1 --> S2 --> S3 --> S4 --> S5 --> S6
    end

    Pipeline -.->|Imports and Shared DB State| Core"""
    },

    # 7. LLD Lifecycle State Machine
    "lld_lifecycle_state_machine": {
        "title": "Entity Lifecycle State Machine (Stage Transitions)",
        "code": """stateDiagram-v2
    [*] --> IngestionPending: Webhook Arrived
    IngestionPending --> SourceEventCreated: Signature OK and Scrubbed
    SourceEventCreated --> IngestionPending: Replay Requested
    
    SourceEventCreated --> ChangeDiscovered: Normalizer Extracts Refs
    ChangeDiscovered --> ChangeInProgress: Additional Commits/PRs
    ChangeInProgress --> ChangeMerged: PR Merged / Ticket Done
    
    ChangeMerged --> CandidatePendingReview: Decisioner Evaluates
    CandidatePendingReview --> CandidateConfirmed: PMM Confirms Tier
    CandidatePendingReview --> CandidateRejected: PMM Suppresses Change
    
    CandidateConfirmed --> PackDraft: Generator Produces Copy
    PackDraft --> PackInReview: Linters and Verifier Pass
    PackInReview --> PackFinalized: Approvers Sign Off
    PackFinalized --> LaunchRecordCreated: Atomic Finalization
    LaunchRecordCreated --> Mem0MemoryStored: Mem0 Algorithm 1 Ingestion
    
    LaunchRecordCreated --> LaunchRetracted: Retraction / Rollback
    Mem0MemoryStored --> Mem0MemoryInvalidated: Retraction Updates Graph
    LaunchRecordCreated --> [*]"""
    },

    # 8. LLD Mem0 Memory Management Engine
    "lld_mem0_memory_engine": {
        "title": "Mem0 Dual-Phase Long-Term Memory Engine & Algorithm 1",
        "code": """flowchart TD
    subgraph Mem0Extraction["Mem0 Extraction Phase"]
        direction TB
        FinalizedLaunch["Finalized Launch Pack and Assets"] --> Extractor["LLM Entity and Fact Extractor"]
        Extractor --> CandidateFacts["Candidate Facts and Triplets"]
    end

    subgraph Mem0Update["Mem0 Update Phase (Algorithm 1)"]
        direction TB
        VectorSearch["Top-S Similar Memory Search via pgvector"]
        VectorSearch --> ToolCallClassifier{"LLM Operation Classifier"}
        
        ToolCallClassifier -->|New Fact| OpADD["ADD: Create New Memory Node"]
        ToolCallClassifier -->|Richer Context| OpUPDATE["UPDATE: Augment Existing Node"]
        ToolCallClassifier -->|Contradicted/Superseded| OpDELETE["DELETE: Soft-Invalidate Obsolete Node"]
        ToolCallClassifier -->|Redundant/Known| OpNOOP["NOOP: Discard / No Action"]
    end

    subgraph Mem0GraphStore["Mem0g Graph and Vector Store"]
        direction TB
        GraphStore[("PostgreSQL 16 + pgvector")]
    end

    CandidateFacts --> VectorSearch
    OpADD --> GraphStore
    OpUPDATE --> GraphStore
    OpDELETE --> GraphStore"""
    }
}

out_dir = os.path.join(os.path.dirname(__file__), "..", "resources", "images")
os.makedirs(out_dir, exist_ok=True)

print(f"=== Rendering {len(DIAGRAMS)} Diagrams to PNG & SVG ===")

for name, meta in DIAGRAMS.items():
    code = meta["code"]
    raw_b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
    
    # 1. Fetch PNG
    png_url = f"https://mermaid.ink/img/{raw_b64}"
    req_png = urllib.request.Request(png_url, headers={"User-Agent": "Mozilla/5.0"})
    png_path = os.path.join(out_dir, f"{name}.png")
    
    try:
        with urllib.request.urlopen(req_png, timeout=15) as resp:
            data = resp.read()
            with open(png_path, "wb") as f:
                f.write(data)
            print(f"  [PNG OK] {name}.png ({len(data)} bytes)")
    except Exception as e:
        print(f"  [PNG FAIL] {name}: {e}")
        
    # 2. Fetch SVG
    svg_url = f"https://mermaid.ink/svg/{raw_b64}"
    req_svg = urllib.request.Request(svg_url, headers={"User-Agent": "Mozilla/5.0"})
    svg_path = os.path.join(out_dir, f"{name}.svg")
    try:
        with urllib.request.urlopen(req_svg, timeout=15) as resp:
            data = resp.read()
            with open(svg_path, "wb") as f:
                f.write(data)
            print(f"  [SVG OK] {name}.svg ({len(data)} bytes)")
    except Exception as e:
        print(f"  [SVG FAIL] {name}: {e}")
        
    time.sleep(0.3)

print("=== Rendering Completed ===")
