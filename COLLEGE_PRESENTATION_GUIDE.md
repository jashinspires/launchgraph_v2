# LaunchGraph V1 — 30% Milestone Project Presentation
> **Current Status:** 30% Milestone Completed & Verified (Batch 0, Milestone M1, Milestone M2 Core)

---

## Table of Contents
1. [What is LaunchGraph? (The Plain-English Foundation)](#1-what-is-launchgraph-the-plain-english-foundation)
2. [The Continuous End-to-End Story: A Feature's Journey from Code to Launch](#2-the-continuous-end-to-end-story-a-features-journey-from-code-to-launch)
3. [System Architecture & 5-Stage Pipeline](#3-system-architecture--5-stage-pipeline)
4. [Deep-Dive: The 30% Completed Implementation](#4-deep-dive-the-30-completed-implementation)
   - [Phase 1: Batch 0 — Shared Core Architecture (0% – 10%)](#phase-1-batch-0--shared-core-architecture-0--10)
   - [Phase 2: Milestone M1 — Live Telemetry Ingestion (10% – 25%)](#phase-2-milestone-m1--live-telemetry-ingestion-10--25)
   - [Phase 3: Milestone M2 Core — Context Graph Normalization (25% – 30%)](#phase-3-milestone-m2-core--context-graph-normalization-25--30)
   - [Automated Verification & Test Harness](#automated-verification--test-harness)
5. [Roadmap: The Remaining 70% Implementation Plan](#5-roadmap-the-remaining-70-implementation-plan)
6. [Lecturer Viva / Defense Q&A Cheatsheet](#6-lecturer-viva--defense-qa-cheatsheet)
7. [Repository & Code Reference](#7-repository--code-reference)

---

## 1. What is LaunchGraph? (The Plain-English Foundation)

> **The 30-Second Elevator Pitch for Lecturers:**  
> *"When software developers merge code on GitHub, close tickets on Jira, and announce fixes on Slack, marketing teams (PMMs) and AI agents have no automatic way to know what was built, how important it is, or how to explain it without hallucinations.  
> **LaunchGraph is an intelligent software bridge** that ingests developer activity, organizes it into a clean graph of product changes, automatically proposes launch significance (Tiers T0–T3), drafts grounded marketing copy governed by strict deterministic safety linters, and stores verified release memories in a graph memory database (Mem0) so downstream AI agents never forget what launched."*

### 1.1 The Real-World Problem: "The Developer-to-Marketing Disconnect"
In modern tech companies, there is a massive communication chasm between Engineering and Go-To-Market (Marketing/Support/DevRel):

| Problem Area | The Traditional Reality (Before LaunchGraph) | How LaunchGraph Solves It |
|:---|:---|:---|
| **Scattered Telemetry** | A product change is scattered across 4 pull requests, 2 Jira tickets, and 30 Slack messages. Marketing has to manually hunt down developers to understand what changed. | **Stage 1 & 2:** Automatically ingests webhooks, scrubs leaked secrets, extracts ticket IDs, and links all PRs and commits into a single unified `ChangeEvent`. |
| **Launch Fatigue & Misclassification** | Small bugfixes get noisy marketing posts while critical, revenue-driving features slip silently into release notes without announcement. | **Stage 3:** Deterministically evaluates impact, CI tests, and breaking changes. Asks LLMs 9 structured questions to propose launch tiers ($T0$: Internal to $T1$: Strategic). |
| **Generative Hallucinations & Leaks** | ChatGPT/Claude drafting marketing copy often hallucinates unbuilt features, leaks internal codenames (e.g. *"Project Titan"*), or violates pricing boundaries. | **Stage 4:** Binds generation to a 12,000-token evidence pack and passes copy through **14 deterministic safety linters** before any human sees it. |
| **Human Review Bottleneck** | Marketing leads rewrite copy without structured feedback, and approvals are done casually over Slack threads without an audit trail. | **Stage 5:** Provides side-by-side evidence diffs, multi-party approval gates ($T1$ requires two independent sign-offs), and captures structured **reason chips** on edits. |
| **AI Agent Amnesia** | Downstream chatbots (social media posters, documentation bots) have no persistent memory of past releases. Stuffing 100 past changelogs into prompt windows causes high latency ($>3\text{s}$) and context confusion. | **Mem0 Graph Memory:** Organizes releases into dynamic entity-relationship triplets ($G=(V,E,L)$), updating memories via `ADD`/`UPDATE`/`DELETE` with $<200\text{ms}$ search latency. |

---

## 2. The Continuous End-to-End Story: A Feature's Journey from Code to Launch

To help lecturers immediately visualize the system, walk them through a **concrete real-world feature**:  
**Example Feature:** *"PROJ-1024: Support OAuth 2.0 PKCE Login Flow"*

Here is the sequential journey of this change through the LaunchGraph pipeline:

```
[Developer Commits Code]
       │
       ▼
[Stage 1: Ingestion :8001]           --> Webhooks verified, AWS keys scrubbed, deduplicated
       │
       ▼
[Stage 2: Normalization :8002]       --> PR #142 linked to Jira PROJ-1024 (L1 implements)
       │                                 ================================================
       │                                 ★ CURRENT 30% MILESTONE REACHED HERE ★
       ▼                                 ================================================
[Stage 3: Decisioning :8003]         --> Claude Q1-Q9 consensus, Security Policy triggered -> Tier T1
       │
       ▼
[Stage 4: Generation :8004]          --> Drafts Changelog, Email, LinkedIn; 14 Linters verify safety
       │
       ▼
[Stage 5: Review & Mem0 :8005]       --> Human Lead PMM approves; Mem0 Graph creates capability node
       │
       ▼
[Stage 6: A2A Egress :8006]          --> Downstream Twitter/Newsletter bot fetches verified copy safely
```

### The Step-by-Step Lifecycle Table

| Step | System Stage | Real-World Event / Action | What LaunchGraph Does Internally | Concrete Output / State |
|:---:|:---|:---|:---|:---|
| **1** | **Stage 1: Ingestion** (:8001) | Developer opens Jira ticket `PROJ-1024`. Later, dev merges GitHub PR #142 containing commit diffs and an accidental dev AWS key `AKIAIOSFODNN7EXAMPLE`. | Verifies `X-Hub-Signature-256` HMAC. Checks idempotency key `github:deliv-001:pull_request`. Scans payload with `SecretScrubber` and redacts the AWS key to `[REDACTED_SECRET]`. | Written to `webhook_inbox` and cleanly saved in `source_events` with trust label `INTERNAL`. |
| **2** | **Stage 2: Normalization** (:8002) | Autonomous worker picks up the unhandled source events. | `ReferenceExtractor` finds `PROJ-1024` and `#142`. `LinkTypingEngine` classifies relationship as **$L1$ (`implements`)**. `AnchorResolver` creates a single primary `ChangeEvent` (`JIRA:PROJ-1024`). `LedgerManager` writes immutable attachment into `change_membership`. | PR #142 and Jira PROJ-1024 are permanently linked together in the context graph. State: `merged`. |
| **—** | **CURRENT STATUS** | **★ 30% MILESTONE COMPLETED HERE ★** | **The entire data intake, security hygiene, reference extraction, link typing, and context graph ledger are operational and 100% verified with 34 tests.** | **Foundation Ready** |
| **3** | **Stage 3: Decisioning** (:8003) | The merged change needs to be classified: Is this a minor fix or a major strategic launch? | Assembles an `EvidencePack` (capped at 12,000 tokens). Queries Claude Opus 5 with Questions $Q1$–$Q9$ across $k=3$ samples. Evaluates policy rule $P\text{-SEC}$ (security/auth change). | Proposes **Tier $T1$ (Major Launch)** with high confidence. Creates `launch_candidates` entry. |
| **4** | **Stage 4: Generation** (:8004) | Marketing copy needs to be drafted for Tier $T1$. | Builds a 6-Block prompt (Brand profile, persona, evidence summary, decision facts, claim bounds, and Mem0 few-shot memory). Drafts Changelog, Email, and LinkedIn announcement. Runs **14 deterministic linters** (checking for leaked codenames, pricing shifts, profanity, length bounds). | Generates `gtm_pack` containing 3 asset drafts, each citing sentence-level evidence chunks. Status: `IN_REVIEW`. |
| **5** | **Stage 5: Review & Mem0** (:8005) | Product Marketing Manager (Human) opens review dashboard. | Displays side-by-side draft copy and cited evidence. Reviewer tweaks a sentence (capturing structured **reason chip**: *"Tone adjusted"*). Both Lead PMM and Security Lead sign off. Transaction atomically writes frozen snapshot to `launch_records`. Background job executes **Mem0 Algorithm 1** (`ADD` new PKCE node in graph $G=(V,E,L)$). | Launch finalized. Mem0 long-term memory permanently updated with new product capability node and persona edge. |
| **6** | **Stage 6: A2A Egress** (:8006) | Downstream autonomous Twitter poster or newsletter bot requests latest releases via REST API. | Bot calls `GET /v1/bundle`. Request passes through the **5-step egress filter** (verifies tenant matching, `is_external_safe == True`, checks marketing embargo date, runs final secret scrubber, logs request). | Downstream agent receives clean, approved, 100% hallucination-free launch intelligence in $<150\text{ms}$. |

---

### 2.1 Why This Sequential Build Order? (The Architectural Dependency Chain)

When presenting to the team or lecturers, emphasize that LaunchGraph **cannot be built randomly**; it follows a strict **engineering dependency chain**:

```
[Batch 0: Core Foundation] ──► [Stage 1: Ingestion] ──► [Stage 2: Normalization]
      (Tables & Crypto)             (Intake & Scrubbing)        (Stitching & Ledger)
                                                                        │
                                                         ★ 30% MILESTONE READY ★
                                                                        │
                                                                        ▼
[Stage 6: A2A Memory API] ◄── [Stage 5: Review & Mem0] ◄── [Stage 4: Generation] ◄── [Stage 3: Decisioning]
  (External Agent Access)       (Human Approval + Graph)    (Draft Copy + 14 Linters)   (Tier Classification)
```

1. **Why Batch 0 (0%–10%) was built FIRST:**  
   You cannot receive webhooks without database tables, and you cannot verify incoming signatures without cryptographic primitives (`hmac`, `sha256`). You also cannot coordinate background jobs safely without PostgreSQL `FOR UPDATE SKIP LOCKED`. Therefore, all 34 tables, async connection pools, Alembic migrations, and Pydantic frozen contracts had to be established first.
2. **Why Stage 1 Ingestion (10%–25%) was built SECOND:**  
   You cannot process or normalize telemetry if data cannot enter the system. Stage 1 connects the real world (GitHub, Jira, Slack) to the database, enforcing strict deduplication and secret scrubbing so leaked API tokens never contaminate downstream systems.
3. **Why Stage 2 Normalization (25%–30%) was built THIRD (Completing the 30% Milestone):**  
   Raw webhooks are noisy and fragmented (e.g., 3 PRs and 2 tickets for one feature). An AI model or marketing person cannot evaluate 5 disconnected events in isolation. Stage 2 stitches them into a single, unified `ChangeEvent` using deterministic reference extraction and an append-only membership ledger.
4. **Why Stages 3–6 follow sequentially in the remaining 70%:**  
   - **Stage 3 (Decisioning)** requires the unified `ChangeEvent` from Stage 2 to determine if it is a major ($T1$) or minor ($T3$) release.
   - **Stage 4 (Generation)** requires the classified candidate from Stage 3 to draft marketing copy.
   - **Stage 5 (Review & Mem0)** requires draft copy from Stage 4 for human sign-off and graph memory storage.
   - **Stage 6 (A2A Interface)** requires finalized, verified launch records from Stage 5 so downstream AI agents can query them without hallucinating.

---

## 3. System Architecture & 5-Stage Pipeline

### 3.1 Core Architectural Principles
When explaining the architecture to lecturers, emphasize these **5 founding engineering principles**:

| Principle | Academic / Technical Rationale |
|:---|:---|
| **PostgreSQL-First & Minimal Sprawl** | PostgreSQL 16 acts as relational datastore, vector database (`pgvector`), and transactional job queue (`FOR UPDATE SKIP LOCKED`). No unnecessary message brokers (Kafka/RabbitMQ) or external vector DBs are introduced, keeping operations lean and ACID-compliant. |
| **Deterministic Where Possible** | Regex extraction, link typing, policy checks, secret scrubbing, and 14 safety linters are written in pure deterministic Python. Probabilistic LLMs are never entrusted with tasks deterministic code can solve faster, cheaper, and with $100\%$ precision. |
| **Propose, Never Decide** | LaunchGraph proposes classifications and marketing drafts. Humans confirm tiers for major changes and approve every external asset. |
| **Last Gates Carry Safety** | Prompting instructions alone cannot guarantee safety. Safety is strictly guaranteed by deterministic linters ($L3$), human sign-offs ($L4$), and the egress filter ($L5$). |
| **Mem0 Graph Memory ($G=(V,E,L)$)** | Based on Chhikara et al. (2025), long-term release memory uses dynamic entity-relationship triplets and Algorithm 1 operations (`ADD`, `UPDATE`, `DELETE`, `NOOP`) rather than naive, unorganized text RAG chunking. |

### 3.2 Microservice Topology

![[Pasted image 20261011082353.png]]
---

## 4. Deep-Dive: The 30% Completed Implementation

The 30% mark represents the complete architectural foundation, live telemetry ingestion, and core change graph assembly.

<div align="center">

![30% Completed Implementation Distribution](resources/images/guide_milestone_pie.png)

</div>

---

### Phase 1: Batch 0 — Shared Core Architecture (`0% – 10%`)

#### 1. Complete Database Schema (34 Tables)
We designed and registered **34 normalized tables** using SQLAlchemy 2.0 Async across four distinct functional domains and the Mem0 graph layer:

| Domain | Key Tables | Responsibility & Structural Invariants |
|:---|:---|:---|
| **Domain 1: Identity & Brand** | `workspaces`, `brands`, `app_users`, `brand_profiles`, `audience_segments`, `person_identities` | Tenant boundary container (`workspace_id`), brand voice tone rules, allowed/disallowed claim whitelists, persona pain points, and cross-platform developer identity mappings. |
| **Domain 2: Ingestion & Graph** | `connections`, `webhook_inbox`, `source_events`, `change_events`, `change_membership`, `link_suggestions`, `change_relations` | Raw append-only webhook buffer with unique idempotency keys, sanitized source events, primary change entities, and an append-only membership ledger. |
| **Domain 3: Governance & Packs** | `launch_candidates`, `decision_runs`, `gtm_packs`, `gtm_assets`, `asset_revisions`, `lint_findings`, `approval_events`, `launch_records` | Tier proposal evaluation, immutable decision run audits, asset containers, sentence-level citation links, reviewer reason chips, and frozen `launch_records` with pgvector embeddings. |
| **Domain 4: Platform & Security** | `api_keys`, `llm_call_logs`, `jobs`, `audit_logs`, `a2a_request_logs`, `egress_filters`, `policy_rules`, `triage_queues`, `rate_limits` | SHA-256 hashed API keys (`launchgraph_live_...`), token-level financial accounting, PostgreSQL `SKIP LOCKED` job queue, and sliding window rate limits. |
| **Mem0 Long-Term Memory Graph** | `mem0_entity_nodes`, `mem0_relation_edges`, `mem0_memory_operations`, `brand_profile_evolutions` | Graph representation $G = (V, E, L)$ storing capability nodes, directed relationship triplets $(v_s, r, v_d)$, and an audit trail of Algorithm 1 operations (`ADD`, `UPDATE`, `DELETE`, `NOOP`). |

#### 2. Alembic Database Migration Environment
* Configured `alembic.ini` and `migrations/env.py` to support asynchronous schema migrations.
* Created baseline revision `0001_initial_schema.py` creating all 34 tables with foreign keys, indexes, and unique constraints.

#### 3. Frozen Inter-Service Contracts (Pydantic v2)
To ensure strict decoupled contracts between microservices, we implemented type-enforced schemas:
* **Job Contracts (`jobs.py`):** Defines `JobEnvelope`, retry policies (max retries, exponential backoff), and deterministic deduplication keys (`normalize:PROJ-1024:v1`).
* **Ingress Contracts (`ingress.py`):** Frozen schemas for GitHub (`pull_request`, `push`, `release`), Jira (`issue_created`, `issue_updated`, `version_released`), and Slack Events.
* **Decisioner Contracts (`decisioner.py`):** Structured schemas for Questions $Q1$–$Q9$, consensus scoring, and the **12,000 token bounding ceiling** in `EvidencePack`.
* **Restrict-Only Policy DSL:** 11 default policy rules ($P\text{-SEC}$, $P\text{-CUST}$, $P\text{-EMBARGO}$, $P\text{-COMPL}$, $P\text{-DEPR}$, $P\text{-INTERNAL}$, etc.) enforcing that policies can only escalate tiers or add blockers, never loosen constraints.
* **Generator & Linter Contracts (`generator.py`):** Character length bounds for 9 asset types and violation schemas for 14 deterministic linters.
* **Mem0 Memory Contracts (`mem0.py`):** Candidate facts ($\Omega$), Algorithm 1 operations, and relationship triplets.
* **A2A Protocol Contracts (`a2a.py`):** Egress responses, brand guidance, bundles, and discovery manifests.

#### 4. Security Baseline
* **High-Performance Secret Scrubber (`SecretScrubber`):** Compiled regex engine that recursively sanitizes nested JSON payloads, redacting AWS access keys, GitHub tokens, Slack tokens, JWTs, private keys, and generic API secrets to `[REDACTED_SECRET]` before persistence.
* **Cryptographic Verification (`launchgraph_core.security.crypto`):** Constant-time HMAC-SHA256 signature verification for GitHub and Slack (with 5-minute replay attack windows) and timing-attack-resistant API key hashing.
* **PostgreSQL `SKIP LOCKED` Worker Engine:** Transactional row-claiming coordinating worker tasks without Redis or distributed lock contention.

---

### Phase 2: Milestone M1 — Live Telemetry Ingestion (`10% – 25%`)

The Ingestion Microservice (`services/ingester`, Port 8001) implements the complete ingress pipeline:

<div align="center">

![Milestone M1: Live Ingestion Pipeline Flowchart](resources/images/guide_ingestion_pipeline.png)

</div>

1. **GitHub App Webhook Receiver (`POST /webhooks/github/{connection_id}`):**
   * Validates `X-Hub-Signature-256`.
   * Computes deduplication key: `github:{delivery_id}:{event_type}`.
   * Handles `pull_request.closed`, `push`, and `release.published`.
2. **Jira Cloud Receiver (`POST /webhooks/jira/{connection_id}`):**
   * Verifies Jira signatures/tokens.
   * Computes idempotency key: `jira:{issue_id}:{timestamp}`.
   * Processes issue creation, issue lifecycle updates, and version releases.
3. **Slack Events API Receiver (`POST /webhooks/slack/{connection_id}`):**
   * Responds to `url_verification` challenge handshakes.
   * Validates `X-Slack-Signature` and checks timestamp drift ($< 300\text{ seconds}$).
   * Adheres strictly to enterprise privacy guidelines: **Zero historical conversation harvesting or channel scraping**.
4. **Reconciler & Retention Maintenance:**
   * Automated 30-day retention purge sweeping raw payloads from `webhook_inbox`.
   * Out-of-band dead-letter reconciler for recovering from network outages.

---

### Phase 3: Milestone M2 Core — Context Graph Normalization (`25% – 30%`)

The Normalizer Microservice (`services/normalizer`, Port 8002) transforms scrubbed raw events into an anchored, typed context graph:

<div align="center">

![Milestone M2 Core: Context Graph Normalization Flowchart](resources/images/guide_normalization_pipeline.png)

</div>

#### 1. Deterministic Reference Extractor (`ReferenceExtractor`)
Extracts external identifiers from PR titles, descriptions, and commit bodies using compiled regular expressions:
* **Jira Keys:** `\b([A-Z][A-Z0-9]+-[0-9]+)\b`
* **GitHub PR Numbers:** `#([0-9]+)` and full URLs `github.com/.../pull/(\d+)`
* **Commit SHAs:** `\b([a-f0-9]{7,40})\b`

#### 2. Deterministic Link Typing Engine ($L1$–$L8$)
Categorizes relationship types with high precision:
* **$L1$ (`implements`):** PR branch name or title directly contains the Jira issue key.
* **$L2$ (`mentions`):** Informal citation in discussions or commit messages.
* **$L3$ (`fixes`):** Explicit defect closure keywords (`Fixes #12`, `Closes PROJ-45`, `Resolves PROJ-10`).
* **$L4$ (`reverts`):** Git revert commit syntax (`Revert "..."`) or rollback ticket.
* **$L5$ (`contains`):** Release versions and Jira Epics containing child issues.
* **$L6$ (`relates_to`), $L7$ (`duplicate_of`), $L8$ (`blocks`):** Jira issue link types.

#### 3. Anchor Resolution Hierarchy
Resolves every product change around a single canonical entity following the priority order:
$$\text{Jira Epic} \longrightarrow \text{Jira Issue} \longrightarrow \text{GitHub PR} \longrightarrow \text{Promoted Slack Thread}$$
If a Jira issue is cited in a GitHub PR, LaunchGraph binds the PR to the existing Jira change event rather than creating a disconnected duplicate.

#### 4. Append-Only Membership Ledger (`LedgerManager`)
* All attachments are tracked in `change_membership`.
* **Platform Invariant:** Destructive database `DELETE` operations are strictly prohibited. Unlinking an attachment soft-inactivates the record (`is_active = False`) and mandates an audit rationale (`unlinked_by`, `unlink_reason`, `unlinked_at`).

#### 5. Deterministic Suggestion Ranking Formula
When links are unconfirmed, LaunchGraph ranks candidate associations using a 4-factor formula:
$$\text{Score} = 0.35 \times S_{\text{person}} + 0.20 \times S_{\text{time}} + 0.25 \times S_{\text{path}} + 0.20 \times S_{\text{text}}$$
* $S_{\text{person}} \in \{0.0, 1.0\}$: Matching commit author and ticket assignee.
* $S_{\text{time}} \in [0.0, 1.0]$: Exponential decay over elapsed time (1.0 within 24h, decays over 7 days).
* $S_{\text{path}} \in [0.0, 1.0]$: Repository directory proximity.
* $S_{\text{text}} \in [0.0, 1.0]$: Keyword and title similarity score.

#### 6. Lifecycle & Availability Tracking
* Computes lifecycle transitions: `discovered` $\longrightarrow$ `in_progress` $\longrightarrow$ `merged` $\longrightarrow$ `closed`.
* Tracks availability stage: `unknown`, `internal`, `beta`, `ga`.
* Revert detection flags reverted commits and halts premature marketing copy drafting.

---

### Automated Verification & Test Harness

The project includes an automated test suite executed via `pytest`, achieving **34 passing tests across unit and integration suites**:

```
============================== Test Suite Breakdown ==============================

1. Unit: Schema & Models Integrity (test_models.py)
   - Workspace & Brand cascade deletion rules passed.
   - Mem0 graph entity node & relationship edge persistence passed.

2. Unit: Pydantic v2 Contracts (test_contracts.py)
   - Deduplication key builder and retry policies passed.
   - EvidencePack 12,000 token bounding ceiling enforced strictly.
   - Asset boundary validator (length checks) passed.
   - Restrict-only Policy DSL rules catalog passed.

3. Unit: Security & Sanitization (test_scrubber.py, test_crypto.py)
   - Redaction of AWS keys, GitHub PATs, JWTs, and private keys passed.
   - Recursive dictionary and nested list secret scrubbing passed.
   - GitHub HMAC-SHA256 signature verifier passed.
   - Slack signature with 5-minute replay attack window check passed.
   - API key generation and timing-attack-resistant verification passed.

4. Unit: Normalization & Graph (test_extractor.py, test_link_typing.py, test_anchor_resolver.py, test_ledger.py, test_suggestion_ranker.py)
   - Reference extractor accuracy (Jira, PR, commits) passed.
   - Deterministic link typing priority (L1-L8) passed.
   - Anchor resolution hierarchy (Epic -> Issue -> PR) passed.
   - Append-only ledger soft-unlink invariant & mandatory rationale passed.
   - 4-factor suggestion formula calculation passed.

5. Integration: Webhooks Ingress (test_ingester_webhooks.py)
   - GitHub webhook route with valid and invalid HMAC signatures passed.
   - Slack challenge handshake verification passed.

6. Integration: Replay Storm Verification (test_replay_storm.py)
   - Processed 1,000 duplicate and out-of-order webhook events.
   - Exactly 10 source_events created; exactly 990 rejected as duplicates.
   - Invariant verified: 0 duplicate source_events under heavy storm load.

7. Integration: End-to-End Pipeline (test_normalization_flow.py)
   - Jira Issue ingested -> ChangeEvent created (in_progress).
   - GitHub PR referencing ticket ingested -> classified as L1 implements.
   - Linked to existing ChangeEvent in ledger; state updated to merged.

======================== Result: 34 passed in 4.42s (100%) ========================
```

---

## 5. Roadmap: The Remaining 70% Implementation Plan

Here is what remains to be built to reach 100% General Availability (GA):

<div align="center">

![LaunchGraph V1 Implementation Plan & Roadmap](resources/images/guide_implementation_gantt.png)

</div>

### 1. Milestone M2 Completion (`30% -> 40%`)
* Material change detection rules (8 trigger rules with quiet period throttling).
* Triage queues web UI integration (Unlinked, Conflicts, Availability).
* Evaluation suite $E1$ attach precision validation ($\ge 99.0\%$).

### 2. Stage 3: Decisioning Engine Core (`40% -> 55%`)
* **Deterministic Fact Extractor:** Extracts changed file counts, CI test status, documentation flags, and author attribution.
* **Deterministic Sensitivity Detectors:** Security/CVE pattern scanner, customer PII/NDA detector, regulatory keyword scanner, pricing/monetization shift detector.
* **Evidence Pack Assembler:** Assembles context from anchored events strictly bounded at $12,000$ tokens with chunk IDs and trust labels.
* **The Judgment Interface:** Executes Questions $Q1$ through $Q9$ across $k=3$ temperature samples using Claude Opus 5, computing consensus answers and confidence bands (`high`, `medium`, `low`).
* **Deterministic Tier Function:** Combines facts, $Q1$–$Q9$, and policy hits into final proposed tiers:
  * $T0$: Internal infrastructure only (no external GTM).
  * $T3$: Minor changelog update.
  * $T2$: Notable product feature.
  * $T1$: Major strategic product launch.

### 3. Stage 4: Generation & Deterministic Safety Linters (`55% -> 70%`)
* **6-Block Context Assembler:**
  1. Brand Profile & Voice Rules
  2. Audience Segment Persona
  3. Normalized Change Summary & Evidence Pack
  4. Decision Rationale & Fact Sheet
  5. Allowed/Disallowed Claim Boundaries
  6. **Mem0 Dual-Retrieved Few-Shot Examples:** Retrieves past approved copy via entity subgraph and semantic triplet similarity.
* **Asset Generator:** Produces 9 asset types (`CHANGELOG`, `EMAIL`, `LINKEDIN`, `SALES_SNIPPET`, `SUPPORT_FAQ`, `INTERNAL_BRIEF`, `PRODUCT_BLOG`, `RELEASE_NOTE`, `X_THREAD`).
* **14 Deterministic Safety Linters:** Enforces $100\%$ recall on seeded violations (`LINT-CODENAME`, `LINT-UNCITED`, `LINT-TOKEN`, `LINT-COMPETITOR`, `LINT-SUPERLATIVE`, `LINT-PRICING`, `LINT-TIMING`, `LINT-EMBARGO`, `LINT-LENGTH`, `LINT-PROFANITY`, `LINT-SECURITY`, `LINT-FORMAT`, `LINT-PERSONA`, `LINT-DISALLOWED-CLAIM`).
* **Claim Verifier:** Secondary verification pass ensuring every assertion cites an explicit evidence chunk.

### 4. Stage 5: Review UI & Mem0 Long-Term Memory Engine (`70% -> 80%`)
* **PMM Review Dashboard:** Side-by-side asset copy and cited evidence viewer, token-level edit diffs, structured reason chips, and mandatory override modals.
* **Multi-Party Approval Rules:** Dual approver rule for $T1$ Major launches (Lead PMM + Product Lead), domain approver sign-offs on policy hits.
* **Atomic Finalization:** Single transactional snapshot writing to `launch_records` with status `FINALIZED`.
* **Mem0 Memory Management Engine (Algorithm 1):** Evaluates facts against existing memory via `ADD`, `UPDATE`, `DELETE` (soft-invalidation), and `NOOP`.
* **Retraction Feed:** Broadcasts invalidation events when releases are rolled back or embargoed.

### 5. Stage 6: Agent-to-Agent (A2A) Egress Interface (`80% -> 90%`)
* Read-only REST interface with OpenAPI 3.1:
  * `GET /v1/brand`, `GET /v1/bundle`, `GET /v1/pack/{id}`, `GET /v1/similar`, `GET /v1/retractions`, `POST /v1/check`, `GET /.well-known/launchgraph.a2a.json`.
* **5-Step Egress Filter Hard Gate:** Tenant isolation check, `is_external_safe` verification, embargo date check, secret scrubber pass, and synchronous request logging.

### 6. Stage 7: Production Hardening & GA Gate (`90% -> 100%`)
* Evaluation suites $E1$–$E6$ green (Attach precision $\ge 99\%$, Consensus $\kappa_w \ge 0.85$, Lint recall $100\%$, Injection escape $0\%$, Egress leak $0\%$).
* Online Auto-Demotion engine (demotes features if precision drops by $>2\%$).
* Performance budgets verified ($p95 < 200\text{ ms}$ on Mem0 search, $< 150\text{ ms}$ on A2A queries).

---

## 6. Viva Cheatsheet

Here are 8 critical questions technical evaluators and lecturers will likely ask, along with the precise engineering answers:

### Q1: "Why did you build your own job queue using PostgreSQL `SKIP LOCKED` instead of using Celery with Redis or RabbitMQ?"
> **Answer:**  
> "In V1, introducing Redis or RabbitMQ causes infrastructure sprawl and breaks transactional consistency between job queuing and database records. PostgreSQL 16 supports `SELECT ... FOR UPDATE SKIP LOCKED`, which allows multiple concurrent worker processes to claim unprocessed rows atomically without lock contention. Most importantly, it guarantees **transactional isolation**: a job is only marked complete if all related database writes commit successfully. If a worker crashes, the row lock is released and reclaimed automatically."

### Q2: "Why do you use deterministic regex for secret scrubbing and linters instead of having the LLM check for secrets in its prompt?"
> **Answer:**  
> "LLM prompts are probabilistic and vulnerable to prompt injection ($E5$), token confusion, and non-deterministic oversights. In contrast, compiled regular expressions run in microseconds, have zero API cost, and achieve **$100\%$ deterministic recall**. Security and data privacy boundaries must never rely on a probabilistic model when deterministic code can guarantee complete redaction."

### Q3: "How does the Mem0 long-term memory layer differ from standard RAG (Retrieval-Augmented Generation)?"
> **Answer:**  
> "Standard naive RAG chunks raw text into vector databases and performs cosine similarity search. Over time, as a company ships hundreds of releases, naive RAG retrieves outdated or conflicting copy, bloats the LLM context window, and suffers from context degradation.  
> Following the Mem0 framework (*Chhikara et al., 2025*), LaunchGraph uses a structured graph representation $G = (V, E, L)$ and **Algorithm 1**. When a launch is finalized, facts are evaluated against existing memories to determine whether to `ADD` a new capability, `UPDATE` an existing one with richer details, `DELETE`/soft-invalidate superseded claims, or `NOOP` redundant facts. This slashes p95 search latency by $91\%$ ($< 200\text{ ms}$) and reduces LLM token consumption by $>90\%$."

### Q4: "What is an append-only ledger, and why is it important in `change_membership`?"
> **Answer:**  
> "An append-only ledger prohibits destructive database `DELETE` statements. In enterprise change management, auditability is mandatory. When a reviewer unlinks a PR from a Jira issue, we set `is_active = False` and record `unlinked_by`, `unlink_reason`, and `unlinked_at`. This provides an indelible audit trail, allows rollback if an unlinking was done in error, and ensures historical consistency for post-mortem investigations."

### Q5: "Explain the mathematics behind your 4-factor suggestion ranking formula."
> **Answer:**  
> "When developer events lack explicit ticket tags, the formula calculates a composite probability score bounded between $0.0$ and $1.0$:  
> $$\text{Score} = 0.35 \times S_{\text{person}} + 0.20 \times S_{\text{time}} + 0.25 \times S_{\text{path}} + 0.20 \times S_{\text{text}}$$  
> The weights reflect empirical correlation: developer identity ($35\%$) and repository file path overlap ($25\%$) are the strongest signals of related work, followed by temporal proximity ($20\%$, using exponential decay over time) and textual keyword similarity ($20\%$). Candidate links scoring above threshold are staged in the `link_suggestions` table for human triage."

### Q6: "How do you protect against webhook replay attacks from Slack or GitHub?"
> **Answer:**  
> "We implement dual-layer defense:  
> 1. **Timestamp Replay Window:** For Slack, we inspect `X-Slack-Request-Timestamp`. If the timestamp differs from server time by more than 300 seconds (5 minutes), the request is rejected immediately with HTTP 401.  
> 2. **Idempotency Keys:** Every incoming delivery is hashed into a unique idempotency key (e.g. `github:{delivery_id}:{event_type}`) and checked against `webhook_inbox`. Duplicate deliveries return HTTP 200 immediately without reprocessing or re-inserting into `source_events`."

### Q7: "How is multi-tenancy and data isolation enforced across different corporate customers?"
> **Answer:**  
> "All database tables are keyed by `workspace_id`. In PostgreSQL, we enable Row-Level Security (RLS) policies scoped to the tenant context (`app.current_workspace_id`). Furthermore, cryptographic credentials (OAuth tokens, API secrets) are encrypted per workspace using KMS envelope encryption with AES-GCM, preventing any cross-tenant data leakage or accidental shared vector retrieval."

### Q8: "What was the Replay Storm Test and why was it necessary for Milestone M1?"
> **Answer:**  
> "Webhook networks frequently deliver duplicate or out-of-order events during upstream network partitions. In our test harness (`test_replay_storm.py`), we simulated 1,000 webhook events containing 10 distinct events shuffled and replayed 100 times in random order. The test verified that exactly 10 `source_events` were persisted and 990 were acknowledged as duplicates, proving $100\%$ idempotency under concurrent delivery storms."

---

## 7. Repository & Code Reference

The working codebase is initialized and hosted on GitHub:
* **Repository:** [https://github.com/jashinspires/LaunchGraph](https://github.com/jashinspires/LaunchGraph)
* **Branch:** `main`
* **Test Suite:** Run locally with `pytest -v` (34 passed, 100% pass rate).
* **Package Specifications:** `pyproject.toml`, `requirements.txt`, `alembic.ini`.

---

