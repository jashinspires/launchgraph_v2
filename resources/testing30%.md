

Here is a complete, step-by-step test plan with **exact copy-pasteable data** to enter into **Jira**, **GitHub**, and **Slack**. 

This will let us verify all deterministic patterns of the 30% completed engine:
1. **Stage 1 (Ingestion):** Secret scrubbing, idempotency deduplication, and raw telemetry recording.
2. **Stage 2 (Normalization):** Authoritative anchor hierarchy (Jira $\to$ PR $\to$ Slack), deterministic link typing ($L1$ `implements`, $L2$ `mentions`, $L3$ `fixes`), and lifecycle state transitions (`discovered` $\to$ `in_progress` $\to$ `merged`).

---

### Prerequisites: Start Your Listeners

Open two terminal windows in `d:\Projects\LaunchGraph`:

* **Terminal 1 (Slack Live Listener):**
  ```powershell
  python scripts/slack_listener.py
  ```
  *(Keep this running. It connects to your workspace over WebSocket without needing any tunnel.)*

* **Terminal 2 (GitHub Watcher):**
  ```powershell
  python scripts/github_sync.py --watch
  ```
  *(Keep this running. It continuously polls your repo `jashinspires/LaunchGraph`).*

---

### Test Case 1: Canonical Feature Implementation ($L1$ `implements`)
> **Goal:** Verify that a GitHub PR linking to a Jira ticket creates an authoritative anchor and assigns the $L1$ `implements` relationship.

#### Actions:
1. **In Jira:**
   * Create a new ticket (note down its key, e.g. `LG-1` or `KAN-1`):
     * **Summary:** `Build Real-Time Multi-Tenant Ingress Gateway`
     * **Description:** `Initial implementation for LaunchGraph context graph.`
2. **In GitHub ([jashinspires/LaunchGraph/pulls](https://github.com/jashinspires/LaunchGraph/pulls)):**
   * Create a new branch: `feature/KAN-1-ingress`
   * Open a Pull Request:
     * **Title:** `KAN-1: Add multi-tenant ingress event processors`
     * **Body:** `Implements core webhook handlers for KAN-1.`

#### Verification:
In a third terminal, run:
```powershell
python scripts/inspect_tables.py
```
**What to look for in the output:**
* In `[4] CHANGE EVENTS`: An anchor node `JIRA:KAN-1` is created with state `[IN_PROGRESS]`.
* In `[5] CONTEXT GRAPH MEMBERSHIPS`: A ledger edge is created linking `Ref: PR-<number>` $\to$ `JIRA:KAN-1` with `Link: implements (implements)`.

---

### Test Case 2: Multi-Platform Anchor Unification ($L2$ `mentions`)
> **Goal:** Verify that a Slack discussion does **not** create a duplicate change event, but instead attaches as an informal context link ($L2$ `mentions`) to the existing canonical Jira/PR anchor.

#### Actions:
1. **In Slack (`launchgraph.slack.com`):**
   * Go to any channel where `@launchgraph_backend_m` is present (type `/invite @launchgraph_backend_m` if you haven't yet).
   * Send this exact message:
     ```text
     Heads up team: Deployed KAN-1 staging build from PR #1. Everything looks green.
     ```

#### Verification:
Run:
```powershell
python scripts/inspect_tables.py
```
**What to look for in the output:**
* In `[4] CHANGE EVENTS`: No duplicate node created. The count remains the same.
* In `[5] CONTEXT GRAPH MEMBERSHIPS`: A new edge is attached:
  ```text
  Link: mentions (context) | Ref: SLACK:<channel>:<timestamp> -> ChangeEvent: <id_of_KAN-1>
  ```
* **Proof:** Slack telemetry successfully unified with GitHub and Jira into a single context node.

---

### Test Case 3: Bug Fix & State Progression ($L3$ `fixes` & `merged`)
> **Goal:** Verify deterministic closing keywords (`fixes <key>`) trigger link type $L3$ `fixes` and merging the PR transitions the lifecycle state to `merged`.

#### Actions:
1. **In GitHub:**
   * Create a new branch: `bugfix/signature-tolerance`
   * Open a Pull Request:
     * **Title:** `Fixes KAN-2: Signature replay window tolerance`
     * **Body:** `Resolves issue with clock drift in HMAC validation.`
   * Click **Merge pull request** on GitHub!

#### Verification:
Run:
```powershell
python scripts/inspect_tables.py
```
**What to look for in the output:**
* In `[4] CHANGE EVENTS`: Node `JIRA:KAN-2` transitions from `[DISCOVERED]` $\to$ `[MERGED]`.
* In `[5] CONTEXT GRAPH MEMBERSHIPS`: The link type is identified as:
  ```text
  Link: fixes (context) | Ref: PR-<number> -> ChangeEvent: <id>
  ```

---

### Test Case 4: Enterprise Secret Scrubber Verification
> **Goal:** Verify that credentials accidentally pasted into a Slack message or GitHub PR are intercepted and redacted to `[REDACTED_SECRET]` before hitting the database.

#### Actions:
1. **In Slack:**
   * Send a message containing a dummy token:
     ```text
     Testing credentials for KAN-1 with token ghp_999999999999999999999999999999999999 and key AKIAIOSFODNN7EXAMPLE
     ```

#### Verification:
Run:
```powershell
python scripts/inspect_tables.py --details
```
**What to look for in the output:**
* In `[3] SOURCE EVENTS`: Under the payload text:
  ```text
  Payload: {'text': 'Testing credentials for KAN-1 with token [REDACTED_SECRET] and key [REDACTED_SECRET]'}
  ```
* **Proof:** Zero raw credentials or AWS keys made it into persistent storage.

---

### Test Case 5: Idempotency & Replay Protection
> **Goal:** Verify that webhook replay storms or duplicate deliveries are rejected.

#### Actions:
* Slack or GitHub network retries will automatically happen, or you can trigger a resend.
* LaunchGraph computes `idempotency_key = <provider>:<id>` in the `webhook_inbox` table.
* On duplicate delivery, the listener logs:
  ```text
  [Stage 1] Event is duplicate (Idempotency Key: ...). Skipped.
  ```
* No duplicate rows are created in `source_events` or `change_events`.

---

### Summary Checklist of What You Are Verifying

| Verification Point        | Pipeline Stage | Where to Check                  | Expected Result                                        |
| :------------------------ | :------------: | :------------------------------ | :----------------------------------------------------- |
| **Provider Ingress**      |    Stage 1     | `scripts/inspect_tables.py`     | Rows appear in `webhook_inbox`                         |
| **Secret Sanitization**   |    Stage 1     | `inspect_tables.py --details`   | Secrets replaced with `[REDACTED_SECRET]`              |
| **Deduplication**         |    Stage 1     | Terminal 1 & 2 logs             | Replays flagged as `is_duplicate: True`                |
| **Anchor Hierarchy**      |    Stage 2     | `[4] CHANGE EVENTS`             | Unified under `JIRA:<KEY>`                             |
| **Link Typing**           |    Stage 2     | `[5] CONTEXT GRAPH MEMBERSHIPS` | $L1$ (`implements`), $L2$ (`mentions`), $L3$ (`fixes`) |
| **Lifecycle Transitions** |    Stage 2     | `[4] CHANGE EVENTS`             | State advances `in_progress` $\to$ `merged`            |
