This is the complete, granular breakdown of every component, file, class, function, and database migration implemented across **Stage 1 (Ingestion)** and **Stage 2 (Normalization)**.

---

## 1. Database Foundation & Alembic Migrations

### What is Alembic in LaunchGraph?
**Alembic** is the database migration tool for SQLAlchemy. It reads our Python models and translates them into SQL commands to create and update database tables:
* [alembic.ini](file:///d:/Projects/LaunchGraph/alembic.ini): Configures database connection string and migration folder.
* [migrations/env.py](file:///d:/Projects/LaunchGraph/migrations/env.py): Asynchronous migration runner connecting to the async engine and pointing to `Base.metadata`.
* [migrations/versions/0001_initial_schema.py](file:///d:/Projects/LaunchGraph/migrations/versions/0001_initial_schema.py): The initial migration that creates all 14 tables, foreign keys, compound indexes, and unique constraints.

### The Database Engine ([launchgraph_core/db/session.py](file:///d:/Projects/LaunchGraph/launchgraph_core/db/session.py))
* `engine`: Asynchronous SQLAlchemy engine created with `pool_pre_ping=True` (detects dropped connections).
* `get_async_session()`: FastAPI dependency that injects an isolated database session into HTTP route handlers.
* `async_session_scope()`: Context manager (`async with async_session_scope() as session:`) used by workers and background loops for automatic commit and rollback.

### Cross-Database Dialect Abstraction ([launchgraph_core/db/base.py](file:///d:/Projects/LaunchGraph/launchgraph_core/db/base.py))
To allow LaunchGraph to run either on production **PostgreSQL** or zero-config local **SQLite**:
* `CompatibleUUID`: Uses native PostgreSQL `UUID` when connected to PostgreSQL; gracefully falls back to `CHAR(36)` on SQLite.
* `CompatibleJSONB`: Uses PostgreSQL `JSONB` natively; falls back to standard `JSON` on SQLite.
* `CompatibleVector`: Uses `pgvector` on PostgreSQL; falls back to `JSON` on SQLite.
* `TimestampMixin`: Automatically injects UTC `created_at` and `updated_at` timestamps on all entities.

---

## 2. Security & Cryptography Layer ([launchgraph_core/security/](file:///d:/Projects/LaunchGraph/launchgraph_core/security/))

### Cryptographic Verification ([crypto.py](file:///d:/Projects/LaunchGraph/launchgraph_core/security/crypto.py))
1. `verify_github_signature(payload_bytes, secret, header_signature)`:
   * Validates GitHub's `X-Hub-Signature-256` using HMAC-SHA256 with timing-attack resistant `hmac.compare_digest`.
2. `verify_slack_signature(payload_bytes, secret, timestamp_str, signature)`:
   * Validates Slack's `X-Slack-Signature` with a **strict 5-minute replay window**:
     ```python
     if abs(time.time() - int(timestamp_str)) > 300:
         return False
     ```
     Protects against man-in-the-middle attackers replaying captured Slack webhooks.
3. `verify_jira_signature(payload_bytes, secret, signature)`:
   * Validates Atlassian webhook HMAC signatures.
4. `generate_api_key()`, `hash_api_key()`, `verify_api_key()`:
   * Generates secure high-entropy API keys for Stage 6 Agent-to-Agent protocol and stores SHA-256 hashes.

### Enterprise Secret Scrubber ([scrubber.py](file:///d:/Projects/LaunchGraph/launchgraph_core/security/scrubber.py))
1. `SecretScrubber.scrub_text(text)`:
   * Runs compiled regex patterns over text to identify:
     * AWS Access Keys (`AKIA[0-9A-Z]{16}`)
     * GitHub PATs (`ghp_[a-zA-Z0-9]{36}`, `github_pat_...`)
     * Slack Bot/App tokens (`xoxb-...`, `xapp-...`)
     * JWT / Bearer tokens (`eyJ...`)
     * Private Keys (`-----BEGIN (RSA|EC|PRIVATE) KEY-----`)
   * Replaces every match with `[REDACTED_SECRET]`.
2. `SecretScrubber.scrub_payload(payload)`:
   * Recursively traverses arbitrarily nested dictionaries and lists, sanitizing all string values in-place before database insertion.

---

## 3. Stage 1: Ingestion Microservice (:8001)

### Webhook Route Receivers
Mounted in [services/ingester/main.py](file:///d:/Projects/LaunchGraph/services/ingester/main.py):

1. **Slack Receiver ([services/ingester/routes/slack.py](file:///d:/Projects/LaunchGraph/services/ingester/routes/slack.py))**
   * Endpoint: `POST /webhooks/slack/{connection_id}`
   * `receive_slack_webhook(...)`:
     * Handles Slack's initial URL verification handshake (`{"type": "url_verification"}`).
     * Verifies `X-Slack-Signature` and timestamp.
     * Extracts `event_id`, `channel`, and message timestamp `ts`.
     * Generates idempotency key: `slack:{event_id}`.
     * Generates external ID: `SLACK:{channel}:{ts}`.

2. **GitHub Receiver ([services/ingester/routes/github.py](file:///d:/Projects/LaunchGraph/services/ingester/routes/github.py))**
   * Endpoint: `POST /webhooks/github/{connection_id}`
   * `receive_github_webhook(...)`:
     * Verifies `X-Hub-Signature-256`.
     * Responds to GitHub `ping` events.
     * Extracts external ID: `PR-{number}` for pull requests, `COMMIT-{sha}` for pushes, `REL-{tag}` for releases.
     * Generates idempotency key: `github:{delivery_id}:{event_type}`.

3. **Jira Receiver ([services/ingester/routes/jira.py](file:///d:/Projects/LaunchGraph/services/ingester/routes/jira.py))**
   * Endpoint: `POST /webhooks/jira/{connection_id}`
   * `receive_jira_webhook(...)`:
     * Verifies Atlassian signature.
     * Extracts external ID: `JIRA:{issue_key}` or `JIRA:VER-{version_name}`.
     * Generates idempotency key: `jira:{issue_id}:{timestamp}`.

### Ingestion Event Processor ([services/ingester/services/event_processor.py](file:///d:/Projects/LaunchGraph/services/ingester/services/event_processor.py))
`EventProcessor.process_incoming_webhook(...)`:
Coordinates atomic ingress through 4 steps:
1. **Deduplication Check:** Queries `WebhookInbox` for `(connection_id, idempotency_key)`. If found, returns `is_duplicate=True` immediately (no duplicate processing).
2. **Buffer Write:** Appends the raw delivery to table `webhook_inbox` with `status="processed"`.
3. **Sanitization:** Calls `SecretScrubber.scrub_payload(raw_payload)`.
4. **SourceEvent Creation:** Writes the sanitized record to table `source_events` with `is_processed=False`.

---

## 4. Stage 2: Normalization Engine (:8002)

### Reference Extractor ([services/normalizer/services/extractor.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/extractor.py))
`ReferenceExtractor.extract_from_text(text)`:
Deterministic regex scanner that returns an `ExtractedReferences` object:
* **Jira Keys:** `\b([A-Z][A-Z0-9]+-[0-9]+)\b` (e.g. `PROD-101`, `KAN-42`).
* **PR Numbers:** Short `#\d+` and GitHub PR URLs (`github.com/.../pull/\d+`).
* **Commit SHAs:** 7-to-40 character hexadecimal strings (excluding pure numbers).

### Anchor Resolution Hierarchy ([services/normalizer/services/anchor_resolver.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/anchor_resolver.py))
`AnchorResolver.resolve_or_create_change_event(...)`:
Solves the identity problem across different platforms by enforcing an **authoritative hierarchy**:
1. **Jira Epic:** If present in payload fields $\to$ Anchor is `JIRA:<epic_key>`.
2. **Jira Issue:** If Jira keys are found in text $\to$ Anchor is `JIRA:<ticket_key>`.
3. **GitHub PR:** If no Jira ticket, but PR numbers found $\to$ Anchor is `GITHUB:PR-<number>`.
4. **Slack Thread / Commit:** Default fallback $\to$ `SLACK:<channel>:<ts>`.

It checks table `change_events` for that `anchor_ref` in the workspace:
* If it exists $\to$ Reuses the node, updates `last_activity_at`.
* If new $\to$ Creates a canonical `ChangeEvent` entity with state `discovered`.

### Deterministic Link Typing Engine ($L1$–$L8$) ([services/normalizer/services/link_typing.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/link_typing.py))
`LinkTypingEngine.determine_link_type(...)`:
Applies a strict priority cascade to classify the relationship:
* **$L4$ (`reverts`):** Matches git revert keywords (`revert "..."`).
* **$L8$ (`blocks`), $L7$ (`duplicate_of`), $L6$ (`relates_to`):** Matches Jira issue link relationships.
* **$L1$ (`implements`):** PR branch name or title begins with ticket key (e.g., `feature/PROD-101` or `PROD-101: ...`).
* **$L3$ (`fixes`):** Matches closing keywords: `fix #12`, `closes PROD-101`, `resolved KAN-2`.
* **$L5$ (`contains`):** Release versions and Epics.
* **$L2$ (`mentions`):** Default citation for informal discussion in Slack or PR comments.

### Append-Only Context Ledger ([services/normalizer/services/ledger_manager.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/ledger_manager.py))
1. `LedgerManager.attach_reference(...)`:
   * Inserts an immutable `ChangeMembership` record linking the `SourceEvent` to the `ChangeEvent`.
   * Records `link_type`, `role` (`implements` or `context`), `attached_by="system"`, and audit `reason`.
2. `LedgerManager.detach_reference(...)`:
   * **Prohibits destructive SQL deletes.** Performs soft-unlinking (`is_active=False`) with mandatory human rationale chip.

### Lifecycle Tracker ([services/normalizer/services/lifecycle.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/lifecycle.py))
1. `LifecycleTracker.evaluate_state(...)`:
   * Evaluates telemetry to advance product change state:
     * GitHub PR opened $\to$ `in_progress`
     * GitHub PR merged $\to$ `merged`
     * GitHub PR closed (unmerged) $\to$ `closed`
     * Jira status category "Done" $\to$ `merged`
2. `LifecycleTracker.evaluate_availability(...)`:
   * Determines availability tier: `unknown`, `internal`, `beta`, `ga`.

### Candidate Suggestion Ranker ([services/normalizer/services/suggestion_ranker.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/suggestion_ranker.py))
`CandidateSuggestionRanker.calculate_score(...)`:
Calculates deterministic link scores for ambiguous events using the weighted formula:
$$\text{Score} = 0.35 \times S_{\text{person}} + 0.20 \times S_{\text{time}} + 0.25 \times S_{\text{path}} + 0.20 \times S_{\text{text}}$$
* Produces `LinkSuggestion` entries displayed on the Triage Queue for human review.

### Autonomous Normalizer Worker ([services/normalizer/worker.py](file:///d:/Projects/LaunchGraph/services/normalizer/worker.py))
`process_unprocessed_source_events(session, limit=25)`:
The engine coordinating Stage 2:
1. Fetches unprocessed rows from `source_events` where `is_processed == False`.
2. Extracts title, description, and branch names according to source provider.
3. Resolves canonical `ChangeEvent` via `AnchorResolver`.
4. Determines edge relationship via `LinkTypingEngine`.
5. Records the edge via `LedgerManager.attach_reference`.
6. Updates lifecycle state via `LifecycleTracker`.
7. Flips `event.is_processed = True`.

---

## 5. Summary Table: The 5 Core Database Tables

| Table Name | Model Class | What It Stores |
| :--- | :--- | :--- |
| `connections` | `Connection` | Provider configs, encrypted tokens, signing secrets for Slack/GitHub/Jira. |
| `webhook_inbox` | `WebhookInbox` | Append-only deduplication buffer with unique key `(connection_id, idempotency_key)`. |
| `source_events` | `SourceEvent` | Sanitized telemetry where credentials have been redacted by `SecretScrubber`. |
| `change_events` | `ChangeEvent` | The canonical product change nodes (e.g. `JIRA:KAN-1`) with title, description, and state. |
| `change_memberships` | `ChangeMembership` | The immutable ledger edges linking PRs, tickets, and Slack messages with types ($L1$–$L8$). |


---

## 1. What is `pgvector` and How Does LaunchGraph Use It?

### What is `pgvector`?
`pgvector` is an open-source PostgreSQL extension that adds native **high-dimensional vector data types** (`vector(dim)`) and similarity search operators (such as Cosine Distance `<=>`, Euclidean Distance `<->`, and Inner Product `<#>`) directly inside PostgreSQL tables.

### Where is it in the Code?

#### A. The Platform-Independent Vector Wrapper ([launchgraph_core/db/base.py](file:///d:/Projects/LaunchGraph/launchgraph_core/db/base.py#L66-L87))
```python
class CompatibleVector(TypeDecorator):
    impl = JSON
    cache_ok = True

    def __init__(self, dim: int = 1536, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.dim = dim

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector
            return dialect.type_descriptor(Vector(self.dim))
        else:
            return dialect.type_descriptor(JSON())  # Fallback for local SQLite testing
```
* **Why this was built:** In production on **PostgreSQL**, it creates a real `vector(1536)` column (1536 dimensions matches standard OpenAI and Voyage AI embedding models).
* For local testing on **SQLite**, it automatically serializes vectors as `JSON` arrays so you never get crashed by missing PostgreSQL plugins.

#### B. The Database Migration ([migrations/versions/0001_initial_schema.py](file:///d:/Projects/LaunchGraph/migrations/versions/0001_initial_schema.py))
When Alembic runs against PostgreSQL, it executes:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### C. The Mem0 Long-Term Memory Graph ([launchgraph_core/db/models/mem0_graph.py](file:///d:/Projects/LaunchGraph/launchgraph_core/db/models/mem0_graph.py#L29))
The vector is attached to the entity nodes:
```python
class Mem0EntityNode(Base, TimestampMixin):
    __tablename__ = "mem0_entity_nodes"
    
    id: Mapped[uuid.UUID] = mapped_column(CompatibleUUID, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64))  # FEATURE, CLAIM, PERSONA
    name: Mapped[str] = mapped_column(String(255))
    embedding: Mapped[Optional[list]] = mapped_column(CompatibleVector(dim=1536))
```

### Why Does LaunchGraph Need It?
LaunchGraph stores long-term releases as a **Dual Graph ($G = (V, E, L)$)**:
* **The Graph Layer ($E$):** Explicit typed edges (`implements`, `deprecates`, `delivers`).
* **The Semantic Vector Layer ($V$ via `pgvector`):** When downstream AI agents query LaunchGraph via Stage 6 Agent-to-Agent protocol (`GET /v1/a2a/context/query?q="Does LaunchGraph support SAML SSO?"`), `pgvector` runs a sub-200ms vector cosine similarity search across all historical product claims and returns the exact verified facts.

---

## 2. What is the SHA Security and Where is It Implemented?

**SHA-256 (Secure Hash Algorithm 256-bit)** is used in **four distinct security layers** across LaunchGraph:

```
                                  SHA-256 in LaunchGraph
                                            │
        ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
        ▼                   ▼                               ▼                   ▼
1. GitHub Webhooks  2. Slack Webhooks               3. API Key Storage  4. Git Commit Tracing
   HMAC-SHA256         HMAC-SHA256 + 5-min Replay      One-Way SHA Hash    Commit Identification
```

---

### Layer 1: GitHub HMAC-SHA256 Verification ([launchgraph_core/security/crypto.py](file:///d:/Projects/LaunchGraph/launchgraph_core/security/crypto.py#L12-L21))
```python
def verify_github_signature(payload_bytes: bytes, secret: str, header_signature: str) -> bool:
    mac = hmac.new(secret.encode("utf-8"), msg=payload_bytes, digestmod=hashlib.sha256)
    expected = "sha256=" + mac.hexdigest()
    return hmac.compare_digest(expected, header_signature)
```
* **How it works:** GitHub signs every webhook payload using your shared secret and sends the hash in the `X-Hub-Signature-256` header.
* **Security guarantee:** We recompute the HMAC-SHA256 over the raw incoming bytes. We compare with `hmac.compare_digest` (a **constant-time comparison** that executes in identical CPU cycles regardless of how many characters match, protecting against **timing side-channel attacks**).

---

### Layer 2: Slack HMAC-SHA256 + 5-Minute Anti-Replay Defense ([crypto.py](file:///d:/Projects/LaunchGraph/launchgraph_core/security/crypto.py#L24-L42))
```python
def verify_slack_signature(payload_bytes: bytes, secret: str, timestamp_str: str, signature: str) -> bool:
    ts = int(timestamp_str)
    # Reject requests older or newer than 5 minutes to prevent replay attacks
    if abs(time.time() - ts) > 300:
        return False

    sig_basestring = f"v0:{timestamp_str}:{payload_bytes.decode('utf-8')}"
    mac = hmac.new(secret.encode("utf-8"), msg=sig_basestring.encode("utf-8"), digestmod=hashlib.sha256)
    expected = "v0=" + mac.hexdigest()
    return hmac.compare_digest(expected, signature)
```
* **Anti-Replay Attack Protection:** If an attacker intercepts a legitimate Slack webhook over the network and tries to resend it later to flood your servers, the request is rejected immediately if `abs(time.time() - ts) > 300` seconds (5 minutes).
* **Canonical Basestring:** Slack hashes `v0:{timestamp}:{raw_body}` using your **Slack Signing Secret**.

---

### Layer 3: One-Way SHA-256 API Key Storage ([launchgraph_core/db/models/platform.py](file:///d:/Projects/LaunchGraph/launchgraph_core/db/models/platform.py#L13-L33) & [crypto.py](file:///d:/Projects/LaunchGraph/launchgraph_core/security/crypto.py#L60-L80))
LaunchGraph issues scoped API keys (`launchgraph_live_...`) for external Agent-to-Agent access.

```python
def generate_api_key(prefix: str = "launchgraph_live_") -> Tuple[str, str, str]:
    random_part = secrets.token_urlsafe(32)   # 256 bits of CSPRNG cryptographic randomness
    raw_key = f"{prefix}{random_part}"
    key_prefix = raw_key[:16]                 # "launchgraph_live" shown in UI for identification
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest() # SHA-256
    return raw_key, key_prefix, key_hash
```

In table `api_keys`:
* Column `key_hash`: Stores **only the 64-character SHA-256 hex string**.
* **Zero-Knowledge Security:** The cleartext `raw_key` is **never stored anywhere in the database**. Even if a malicious actor completely dumps the database, they cannot reverse the SHA-256 hash or impersonate your API keys.

---

### Layer 4: Git Commit SHA Extraction ([services/normalizer/services/extractor.py](file:///d:/Projects/LaunchGraph/services/normalizer/services/extractor.py#L14))
```python
COMMIT_SHA_PATTERN = re.compile(r"\b([a-f0-9]{7,40})\b")
```
* Git commits themselves are identified by 40-character hexadecimal SHA-1 or SHA-256 hashes (like commit `a9b4a91`).
* The **Reference Extractor** scans pull request bodies, commits, and Slack threads for 7-to-40 character hexadecimal SHAs, binding Git commit history directly to the context graph ledger edges.

---

### Summary: Why These Matter to Your 30% Milestone

| Mechanism | Technology | Security & Architecture Benefit |
| :--- | :--- | :--- |
| **`pgvector`** | `Vector(1536)` | Powers sub-200ms semantic similarity search across release memory ($V$). |
| **HMAC-SHA256** | `hashlib.sha256` | Verifies webhook authenticity from GitHub, Slack, and Jira before any processing occurs. |
| **Anti-Replay Window** | Unix Epoch + Clock Drift | Defends against webhook replay attacks by bounding validity to $\pm 300$ seconds. |
| **SHA-256 Key Hashing** | `secrets.token_urlsafe` | Protects A2A API keys so cleartext credentials are never saved to disk or database. |
| **Constant-Time Compare**| `hmac.compare_digest` | Prevents timing-attack side channels when comparing hashes. |