import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { Request, Response, NextFunction } from "express";
import { settings } from "./src/config.js";
import {
  clearStore,
  GITHUB_CONN_ID,
  initStore,
  JIRA_CONN_ID,
  persistStore,
  SLACK_CONN_ID,
  store,
  WORKSPACE_ID,
} from "./src/store.js";
import {
  signGithubSha256,
  signSlackRequest,
  verifyGithubSignature,
  verifyJiraSignature,
  verifySlackSignature,
} from "./src/security/crypto.js";
import { EventProcessor } from "./src/services/ingester.js";
import {
  acceptLinkSuggestion,
  LedgerManager,
  processUnprocessedSourceEvents,
  rejectLinkSuggestion,
} from "./src/services/normalizer.js";
import {
  addDomainSignoff,
  confirmCandidateTier,
  evaluateChangeEvent,
  processUnprocessedChangeEvents,
  rejectCandidate,
} from "./src/services/decisioner.js";
import {
  generateDraftsForCandidate,
  getTierAssetMatrix,
  overrideLintFinding,
  runPreFlightScan,
  updateAndRelintDraft,
} from "./src/services/generator.js";
import { AssetType, BrandProfile, LintCode } from "./src/types.js";

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function paramStr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function seedDemoPipeline(): void {
  const jiraConn = store.connections.get(JIRA_CONN_ID);
  const ghConn = store.connections.get(GITHUB_CONN_ID);
  const slackConn = store.connections.get(SLACK_CONN_ID);

  // Cluster 1: PROD-88 (Enterprise SSO Authentication -> T2/T1 LaunchCandidate with scrubbed secrets)
  if (jiraConn) {
    EventProcessor.processIncomingWebhook({
      connection: jiraConn,
      event_type: "jira:issue_created",
      idempotency_key: "demo-seed:jira:10088",
      external_id: "JIRA:PROD-88",
      raw_payload: {
        webhookEvent: "jira:issue_created",
        timestamp: 1700000000,
        issue: {
          id: "10088",
          key: "PROD-88",
          fields: {
            summary: "Enterprise SSO Authentication",
            description:
              `Implement SAML2 / Okta integration for enterprise tenants with automatic session redirect handling. AWS_KEY=${["AKIA", "IOSFODNN7EXAMPLE"].join("")}`,
            priority: { name: "High" },
            issuetype: { name: "Story" },
            labels: ["ga"],
            status: {
              name: "In Progress",
              statusCategory: { key: "indeterminate" },
            },
          },
        },
      },
    });
  }

  if (ghConn) {
    EventProcessor.processIncomingWebhook({
      connection: ghConn,
      event_type: "pull_request",
      idempotency_key: "demo-seed:github:pr-42",
      external_id: "PR-42",
      raw_payload: {
        action: "closed",
        pull_request: {
          number: 42,
          title: "Fix PROD-88 SSO callback redirect and session binding",
          body: `Resolves PROD-88 with Okta SAML2 callback sign-in. Removed hardcoded token ${["ghp", "1234567890abcdef1234567890abcdef123456"].join("_")} from staging config.`,
          merged: true,
          merged_at: "2026-10-10T12:00:00Z",
          head: { ref: "feature/PROD-88-sso-fix" },
          user: { login: "jashinspires" },
          labels: [{ name: "ga" }],
          changed_files: [
            "src/auth/sso.ts",
            "src/auth/okta-callback.ts",
            "docs/sso-setup.md",
          ],
        },
      },
    });
  }

  if (slackConn) {
    EventProcessor.processIncomingWebhook({
      connection: slackConn,
      event_type: "slack:message",
      idempotency_key: "demo-seed:slack:evt-1",
      external_id: "SLACK:C08DEVDEPLOY:1700000100",
      raw_payload: {
        event_id: "demo-evt-1",
        event: {
          type: "message",
          channel: "C08DEVDEPLOY",
          text: "Deploying PROD-88 fix from PR #42 to staging for SAML2 Okta enterprise tenants.",
          ts: "1700000100",
          user: "U0C99HY2FB2",
        },
      },
    });
  }

  // Cluster 2: PROD-91 (Security & SOC2 Audit Gate -> requires security_lead + compliance_officer sign-offs)
  if (jiraConn) {
    EventProcessor.processIncomingWebhook({
      connection: jiraConn,
      event_type: "jira:issue_created",
      idempotency_key: "demo-seed:jira:10091",
      external_id: "JIRA:PROD-91",
      raw_payload: {
        webhookEvent: "jira:issue_created",
        timestamp: 1700000200,
        issue: {
          id: "10091",
          key: "PROD-91",
          fields: {
            summary: "SOC2 Audit Log Retention & RBAC Token Rotation",
            description:
              "Adds immutable SOC2 compliance audit log retention policies and automated token rotation hardening to mitigate privilege escalation risk.",
            priority: { name: "High" },
            issuetype: { name: "Story" },
            labels: ["ga"],
            status: {
              name: "Done",
              statusCategory: { key: "done" },
            },
          },
        },
      },
    });
  }

  if (ghConn) {
    EventProcessor.processIncomingWebhook({
      connection: ghConn,
      event_type: "pull_request",
      idempotency_key: "demo-seed:github:pr-91",
      external_id: "PR-91",
      raw_payload: {
        action: "closed",
        pull_request: {
          number: 91,
          title: "PROD-91 Enforce SOC2 audit retention and RBAC rotation",
          body: "Implements breaking migration for legacy token scopes to prevent privilege escalation vulnerability.",
          merged: true,
          merged_at: "2026-10-11T15:30:00Z",
          head: { ref: "feature/PROD-91-soc2-audit" },
          user: { login: "sec-eng" },
          labels: [{ name: "ga" }],
          changed_files: [
            "src/audit/retention.ts",
            "src/rbac/rotation.ts",
            "docs/compliance-soc2.md",
          ],
        },
      },
    });
  }

  processUnprocessedSourceEvents(25);
  processUnprocessedChangeEvents(10);

  // Generate starter GTM drafts for PROD-88 so Stage 4 Linter & Drafts tab is immediately populated
  for (const candidate of store.launchCandidates.values()) {
    const ch = store.changeEvents.get(candidate.change_event_id);
    if (ch?.anchor_ref === "JIRA:PROD-88") {
      generateDraftsForCandidate(candidate);
    }
  }

  // Cluster 3: Ambiguous unlinked Slack message (no PROD-88 or #42 ref) -> triggers SuggestionRanker in Triage Queue
  if (slackConn) {
    EventProcessor.processIncomingWebhook({
      connection: slackConn,
      event_type: "slack:message",
      idempotency_key: "demo-seed:slack:evt-unlinked-1",
      external_id: "SLACK:C08DEVDEPLOY:1700000450",
      raw_payload: {
        event_id: "demo-evt-unlinked-1",
        event: {
          type: "message",
          channel: "C08DEVDEPLOY",
          text: "Verified Okta SAML2 SSO enterprise tenant callback redirect latency in production canary.",
          ts: "1700000450",
          user: "U0C99HY2FB2",
        },
      },
    });
    processUnprocessedSourceEvents(5);
    // Keep orphan unlinked fallback ChangeEvent from creating a noisy candidate until linked/promoted
    for (const ch of store.changeEvents.values()) {
      if (ch.anchor_ref === "SLACK:C08DEVDEPLOY:1700000450") {
        ch.is_processed = true;
      }
    }
  }

  persistStore();
}

const loadedFromDisk = initStore(true);
if (!loadedFromDisk) {
  seedDemoPipeline();
}

const app = express();

app.use(
  express.json({
    limit: "5mb",
    verify: (req: RequestWithRawBody, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Serve static documentation assets and architecture diagram viewer
app.use("/docs", express.static(path.resolve(process.cwd(), "docs")));
app.use(
  "/resources",
  express.static(path.resolve(process.cwd(), "resources"))
);

// ============================================================================
// System & Directory Endpoints
// ============================================================================

app.get("/api/info", (_req: Request, res: Response) => {
  res.json({
    service: "LaunchGraph API",
    version: "2.0.0",
    status: "healthy",
    port: settings.PORT,
    storage: "file-backed JSON store (data/launchgraph-state.json)",
    seeded_ids: {
      workspace_id: WORKSPACE_ID,
      connections: {
        slack: SLACK_CONN_ID,
        github: GITHUB_CONN_ID,
        jira: JIRA_CONN_ID,
      },
    },
    counts: {
      workspaces: store.workspaces.size,
      connections: store.connections.size,
      source_events: store.sourceEvents.size,
      change_events: store.changeEvents.size,
      launch_candidates: store.launchCandidates.size,
      decision_runs: store.decisionRuns.length,
      gtm_drafts: store.gtmDrafts.size,
      pending_triage: store.linkSuggestions.filter(
        (ls) => ls.status === "pending"
      ).length,
    },
  });
});

app.get("/diagrams", (_req: Request, res: Response) => {
  res.sendFile(path.resolve(process.cwd(), "resources", "DIAGRAM_VIEWER.html"));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "launchgraph-unified",
    port: settings.PORT,
    model: settings.MODEL_NAME,
    k_samples: settings.K_SAMPLES,
  });
});

app.get("/metrics", (_req: Request, res: Response) => {
  res.json({
    status: "operational",
    service: "launchgraph-pipeline",
    supported_sources: ["GITHUB", "JIRA", "SLACK"],
    counts: {
      webhook_inbox: store.webhookInbox.size,
      source_events: store.sourceEvents.size,
      change_events: store.changeEvents.size,
      launch_candidates: store.launchCandidates.size,
      gtm_drafts: store.gtmDrafts.size,
    },
  });
});

// ============================================================================
// Stage 1: Ingestion Webhook Endpoints (Fail-Closed HMAC)
// ============================================================================

app.post(
  "/webhooks/github/:connection_id",
  (req: RequestWithRawBody, res: Response) => {
    const connection_id = paramStr(req.params.connection_id);
    if (!isValidUuid(connection_id)) {
      return res.status(422).json({ detail: "Invalid connection_id UUID." });
    }

    const connection = store.connections.get(connection_id);
    if (!connection || connection.source_type !== "GITHUB") {
      return res.status(404).json({ detail: "GitHub connection not found." });
    }

    const secret =
      String(connection.config.webhook_secret || "") ||
      settings.GITHUB_WEBHOOK_SECRET ||
      "";
    const sig = req.header("x-hub-signature-256") || "";
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

    if (!verifyGithubSignature(rawBody, secret, sig)) {
      return res
        .status(401)
        .json({ detail: "Invalid X-Hub-Signature-256 HMAC signature." });
    }

    const payload = (req.body || {}) as Record<string, any>;
    const eventType =
      req.header("x-github-event") || String(payload.action || "unknown");
    const deliveryId = req.header("x-github-delivery") || crypto.randomUUID();
    const idempotencyKey = `github:${deliveryId}:${eventType}`;

    if (eventType === "ping") {
      return res.json({ status: "ok", message: "Pong! Connection verified." });
    }

    let externalId = "unknown";
    if (payload.pull_request) {
      externalId = `PR-${payload.pull_request.number}`;
    } else if (payload.release) {
      externalId = `REL-${payload.release.tag_name}`;
    } else if (payload.after) {
      externalId = `COMMIT-${String(payload.after).slice(0, 12)}`;
    }

    const result = EventProcessor.processIncomingWebhook({
      connection,
      event_type: eventType,
      idempotency_key: idempotencyKey,
      external_id: externalId,
      raw_payload: payload,
      trust_label: "INTERNAL",
    });

    return res.json({
      status: "accepted",
      duplicate: result.is_duplicate,
      source_event_id: result.source_event_id,
      message: result.message,
    });
  }
);

app.post(
  "/webhooks/jira/:connection_id",
  (req: RequestWithRawBody, res: Response) => {
    const connection_id = paramStr(req.params.connection_id);
    if (!isValidUuid(connection_id)) {
      return res.status(422).json({ detail: "Invalid connection_id UUID." });
    }

    const connection = store.connections.get(connection_id);
    if (!connection || connection.source_type !== "JIRA") {
      return res.status(404).json({ detail: "Jira connection not found." });
    }

    const secret =
      String(connection.config.webhook_secret || "") ||
      settings.JIRA_WEBHOOK_SECRET ||
      "";
    const xHubSignature =
      req.header("x-hub-signature") ||
      req.header("x-atlassian-webhook-signature") ||
      "";
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

    // Fail-closed: when a webhook secret is configured, signature header MUST be present & valid
    if (secret) {
      if (!xHubSignature || !verifyJiraSignature(rawBody, secret, xHubSignature)) {
        return res
          .status(401)
          .json({ detail: "Missing or invalid Jira webhook HMAC signature." });
      }
    }

    const payload = (req.body || {}) as Record<string, any>;
    const eventType = String(payload.webhookEvent || "jira:generic");
    const timestamp = payload.timestamp ?? 0;
    const issue = payload.issue;
    const version = payload.version;

    let externalId: string;
    let idempotencyKey: string;

    if (issue) {
      const issueId = issue.id || crypto.randomUUID();
      const issueKey = issue.key || "UNKNOWN";
      externalId = `JIRA:${issueKey}`;
      idempotencyKey = `jira:${issueId}:${timestamp}`;
    } else if (version) {
      const versionId = version.id || crypto.randomUUID();
      const versionName = version.name || "release";
      externalId = `JIRA:VER-${versionName}`;
      idempotencyKey = `jira:version:${versionId}:${timestamp}`;
    } else {
      const webhookId =
        req.header("x-atlassian-webhook-identifier") || crypto.randomUUID();
      externalId = `JIRA:${webhookId}`;
      idempotencyKey = `jira:event:${timestamp}:${externalId}`;
    }

    const result = EventProcessor.processIncomingWebhook({
      connection,
      event_type: eventType,
      idempotency_key: idempotencyKey,
      external_id: externalId,
      raw_payload: payload,
      trust_label: "INTERNAL",
    });

    return res.json({
      status: "accepted",
      duplicate: result.is_duplicate,
      source_event_id: result.source_event_id,
      message: result.message,
    });
  }
);

app.post(
  "/webhooks/slack/:connection_id",
  (req: RequestWithRawBody, res: Response) => {
    const connection_id = paramStr(req.params.connection_id);
    if (!isValidUuid(connection_id)) {
      return res.status(422).json({ detail: "Invalid connection_id UUID." });
    }

    const connection = store.connections.get(connection_id);
    if (!connection || connection.source_type !== "SLACK") {
      return res.status(404).json({ detail: "Slack connection not found." });
    }

    const payload = (req.body || {}) as Record<string, any>;

    if (payload.type === "url_verification") {
      return res.json({ challenge: payload.challenge });
    }

    const secret =
      String(connection.config.signing_secret || "") ||
      settings.SLACK_SIGNING_SECRET ||
      "";
    const sig = req.header("x-slack-signature") || "";
    const tsHeader = req.header("x-slack-request-timestamp") || "";
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(payload));

    if (!verifySlackSignature(rawBody, secret, tsHeader, sig)) {
      return res.status(401).json({
        detail: "Invalid Slack webhook signature or expired timestamp.",
      });
    }

    const eventId = String(payload.event_id || crypto.randomUUID());
    const event = (payload.event || {}) as Record<string, any>;
    const eventType = String(event.type || "message");
    const channel = String(event.channel || "unknown");
    const ts = String(event.ts || "0");

    const result = EventProcessor.processIncomingWebhook({
      connection,
      event_type: `slack:${eventType}`,
      idempotency_key: `slack:${eventId}`,
      external_id: `SLACK:${channel}:${ts}`,
      raw_payload: payload,
      trust_label: "INTERNAL",
    });

    return res.json({
      status: "accepted",
      duplicate: result.is_duplicate,
      source_event_id: result.source_event_id,
      message: result.message,
    });
  }
);

// ============================================================================
// Engineer Pre-Flight & Signed Telemetry Simulator Endpoints
// ============================================================================

app.post("/api/preflight/scan", (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    title?: string;
    body?: string;
    branch_name?: string;
    source_type?: "GITHUB" | "JIRA" | "SLACK";
    draft_copy?: string;
    asset_type?: AssetType;
  };
  const title = typeof body.title === "string" ? body.title : "";
  const description = typeof body.body === "string" ? body.body : "";
  if (!title.trim() && !description.trim()) {
    return res
      .status(422)
      .json({ detail: "Provide a PR/Commit title or body to scan." });
  }

  const report = runPreFlightScan({
    title,
    body: description,
    branch_name: body.branch_name,
    source_type: body.source_type || "GITHUB",
    draft_copy: body.draft_copy,
    asset_type: body.asset_type,
  });

  return res.json(report);
});

app.post("/api/simulator/webhook", (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    source?: "GITHUB" | "JIRA" | "SLACK";
    title?: string;
    body?: string;
    branch_name?: string;
    labels?: string[];
    merged?: boolean;
    changed_files?: string[];
    jira_key?: string;
    run_pipeline?: boolean;
  };

  const source = (body.source || "GITHUB").toUpperCase() as
    | "GITHUB"
    | "JIRA"
    | "SLACK";
  const title = (body.title || "").trim();
  const description = (body.body || "").trim();
  if (!title && !description) {
    return res
      .status(422)
      .json({ detail: "title or body is required for telemetry simulation." });
  }

  let connectionId = GITHUB_CONN_ID;
  let signatureHeader = "";
  let payload: Record<string, unknown>;
  let externalId = "unknown";
  let eventType = "pull_request";

  if (source === "GITHUB") {
    connectionId = GITHUB_CONN_ID;
    const conn = store.connections.get(connectionId)!;
    const prNumber = Math.floor(100 + Math.random() * 899);
    externalId = `PR-${prNumber}`;
    eventType = "pull_request";
    payload = {
      action: body.merged === false ? "opened" : "closed",
      pull_request: {
        number: prNumber,
        title: title || `Update PR #${prNumber}`,
        body: description,
        state: body.merged === false ? "open" : "closed",
        merged: body.merged !== false,
        merged_at: body.merged === false ? null : new Date().toISOString(),
        head: { ref: body.branch_name || `feature/pr-${prNumber}` },
        user: { login: "vscode-author" },
        labels: (body.labels || ["ga"]).map((name) => ({ name })),
        changed_files:
          body.changed_files && body.changed_files.length > 0
            ? body.changed_files
            : ["src/index.ts", "docs/release-notes.md"],
      },
    };
    const secret =
      String(conn.config.webhook_secret || "") ||
      settings.GITHUB_WEBHOOK_SECRET ||
      "";
    signatureHeader = signGithubSha256(
      Buffer.from(JSON.stringify(payload)),
      secret
    );
  } else if (source === "JIRA") {
    connectionId = JIRA_CONN_ID;
    const conn = store.connections.get(connectionId)!;
    const issueKey =
      body.jira_key || `PROD-${Math.floor(100 + Math.random() * 899)}`;
    externalId = `JIRA:${issueKey}`;
    eventType = "jira:issue_created";
    payload = {
      webhookEvent: "jira:issue_created",
      timestamp: Math.floor(Date.now() / 1000),
      issue: {
        id: String(Math.floor(10000 + Math.random() * 89999)),
        key: issueKey,
        fields: {
          summary: title || `Issue ${issueKey}`,
          description,
          priority: { name: "High" },
          issuetype: { name: "Story" },
          labels: body.labels || ["ga"],
          status: {
            name: body.merged === false ? "In Progress" : "Done",
            statusCategory: {
              key: body.merged === false ? "indeterminate" : "done",
            },
          },
        },
      },
    };
    const secret =
      String(conn.config.webhook_secret || "") ||
      settings.JIRA_WEBHOOK_SECRET ||
      "";
    signatureHeader = signGithubSha256(
      Buffer.from(JSON.stringify(payload)),
      secret
    );
  } else {
    connectionId = SLACK_CONN_ID;
    const conn = store.connections.get(connectionId)!;
    const ts = String(Math.floor(Date.now() / 1000));
    externalId = `SLACK:C08DEVDEPLOY:${ts}`;
    eventType = "slack:message";
    payload = {
      event_id: `sim-${crypto.randomUUID().slice(0, 8)}`,
      event: {
        type: "message",
        channel: "C08DEVDEPLOY",
        text: `${title}${description ? `\n${description}` : ""}`,
        ts,
        user: "U0C99HY2FB2",
      },
    };
    const secret =
      String(conn.config.signing_secret || "") ||
      settings.SLACK_SIGNING_SECRET ||
      "";
    signatureHeader = signSlackRequest(
      Buffer.from(JSON.stringify(payload)),
      secret,
      ts
    );
  }

  const connection = store.connections.get(connectionId)!;
  const rawBuf = Buffer.from(JSON.stringify(payload));

  // Verify through actual HMAC helper to mirror production ingress integrity
  const secret =
    source === "SLACK"
      ? String(connection.config.signing_secret || "") ||
        settings.SLACK_SIGNING_SECRET ||
        ""
      : String(connection.config.webhook_secret || "") ||
        (source === "JIRA"
          ? settings.JIRA_WEBHOOK_SECRET
          : settings.GITHUB_WEBHOOK_SECRET) ||
        "";

  const verified =
    source === "SLACK"
      ? verifySlackSignature(
          rawBuf,
          secret,
          String((payload.event as Record<string, unknown>).ts),
          signatureHeader
        )
      : source === "JIRA"
        ? verifyJiraSignature(rawBuf, secret, signatureHeader)
        : verifyGithubSignature(rawBuf, secret, signatureHeader);

  if (!verified) {
    return res
      .status(500)
      .json({ detail: "Failed internal HMAC self-verification." });
  }

  const ingestResult = EventProcessor.processIncomingWebhook({
    connection,
    event_type: eventType,
    idempotency_key: `sim:${source.toLowerCase()}:${crypto.randomUUID()}`,
    external_id: externalId,
    raw_payload: payload,
    trust_label: "INTERNAL",
  });

  let normalized = 0;
  let evaluated = 0;
  if (body.run_pipeline !== false) {
    normalized = processUnprocessedSourceEvents(25);
    evaluated = processUnprocessedChangeEvents(10);
  }

  return res.json({
    status: "accepted",
    source,
    external_id: externalId,
    signature_header: signatureHeader,
    hmac_verified: verified,
    source_event_id: ingestResult.source_event_id,
    normalized_events: normalized,
    evaluated_changes: evaluated,
  });
});

// ============================================================================
// Stage 2: Normalizer & Context Graph Endpoints
// ============================================================================

app.post("/api/normalizer/process", (req: Request, res: Response) => {
  const rawBatch = Number(req.query.batch_size ?? 25);
  const batchSize = Number.isFinite(rawBatch)
    ? Math.max(1, Math.min(100, Math.floor(rawBatch)))
    : 25;
  const processed = processUnprocessedSourceEvents(batchSize);
  res.json({ status: "success", processed_events: processed });
});

app.get("/api/triage/unlinked", (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspace_id || WORKSPACE_ID);
  if (!isValidUuid(workspaceId)) {
    return res.status(422).json({ detail: "Invalid workspace_id UUID." });
  }

  const results = store.linkSuggestions
    .filter(
      (ls) => ls.workspace_id === workspaceId && ls.status === "pending"
    )
    .sort((a, b) => b.score - a.score)
    .map((ls) => {
      const se = store.sourceEvents.get(ls.source_event_id);
      const target = store.changeEvents.get(ls.change_event_id);
      const rawPayload = (se?.raw_payload || {}) as Record<string, any>;
      const snippet =
        rawPayload?.event?.text ||
        rawPayload?.pull_request?.title ||
        rawPayload?.issue?.fields?.summary ||
        se?.external_id ||
        "";
      return {
        ...ls,
        source_external_id: se?.external_id || "unknown",
        source_type: se?.source_type || "UNKNOWN",
        source_snippet: String(snippet),
        target_anchor_ref: target?.anchor_ref || "unknown",
        target_title: target?.title || "unknown",
      };
    });

  return res.json({
    workspace_id: workspaceId,
    count: results.length,
    items: results,
  });
});

app.post("/api/triage/:suggestion_id/accept", (req: Request, res: Response) => {
  const suggestion_id = paramStr(req.params.suggestion_id);
  if (!isValidUuid(suggestion_id)) {
    return res.status(422).json({ detail: "Invalid suggestion_id UUID." });
  }
  const body = (req.body || {}) as { reviewed_by?: string };
  const result = acceptLinkSuggestion(
    suggestion_id,
    body.reviewed_by || "pmm-reviewer"
  );
  if (!result) {
    return res
      .status(404)
      .json({ detail: "Pending link suggestion not found." });
  }
  return res.json({ status: "accepted", ...result });
});

app.post("/api/triage/:suggestion_id/reject", (req: Request, res: Response) => {
  const suggestion_id = paramStr(req.params.suggestion_id);
  if (!isValidUuid(suggestion_id)) {
    return res.status(422).json({ detail: "Invalid suggestion_id UUID." });
  }
  const body = (req.body || {}) as { reviewed_by?: string };
  const result = rejectLinkSuggestion(
    suggestion_id,
    body.reviewed_by || "pmm-reviewer"
  );
  if (!result) {
    return res
      .status(404)
      .json({ detail: "Pending link suggestion not found." });
  }
  return res.json({ status: "rejected", suggestion: result });
});

app.post(
  "/api/memberships/:membership_id/unlink",
  (req: Request, res: Response) => {
    const membership_id = paramStr(req.params.membership_id);
    if (!isValidUuid(membership_id)) {
      return res.status(422).json({ detail: "Invalid membership_id UUID." });
    }
    const body = (req.body || {}) as { unlinked_by?: string; reason?: string };
    try {
      const ok = LedgerManager.softUnlinkReference(
        membership_id,
        body.unlinked_by || "pmm-reviewer",
        body.reason || ""
      );
      if (!ok) {
        return res
          .status(404)
          .json({ detail: "Active membership record not found." });
      }
      return res.json({ status: "unlinked", membership_id });
    } catch (err) {
      return res.status(422).json({
        detail: err instanceof Error ? err.message : "Invalid unlink reason.",
      });
    }
  }
);

app.get("/api/changes", (_req: Request, res: Response) => {
  const items = Array.from(store.changeEvents.values())
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
    .map((ch) => ({
      ...ch,
      active_memberships: store.changeMemberships.filter(
        (m) => m.change_event_id === ch.id && m.is_active
      ).length,
    }));
  res.json({ count: items.length, items });
});

app.get("/api/changes/:change_id", (req: Request, res: Response) => {
  const change_id = paramStr(req.params.change_id);
  if (!isValidUuid(change_id)) {
    return res.status(422).json({ detail: "Invalid change_id UUID." });
  }

  const change = store.changeEvents.get(change_id);
  if (!change) {
    return res.status(404).json({ detail: "ChangeEvent not found." });
  }

  const memberships = store.changeMemberships.filter(
    (m) => m.change_event_id === change.id
  );

  return res.json({
    id: change.id,
    anchor_ref: change.anchor_ref,
    title: change.title,
    description: change.description,
    state: change.state,
    availability: change.availability,
    last_activity_at: change.last_activity_at,
    created_at: change.created_at,
    memberships,
  });
});

// ============================================================================
// Stage 3: Decisioner & Governance Endpoints
// ============================================================================

app.post("/api/decisioner/process", (req: Request, res: Response) => {
  const rawBatch = Number(req.query.batch_size ?? 10);
  const batchSize = Number.isFinite(rawBatch)
    ? Math.max(1, Math.min(50, Math.floor(rawBatch)))
    : 10;
  const processed = processUnprocessedChangeEvents(batchSize);
  res.json({ status: "success", evaluated_changes: processed });
});

app.post(
  "/api/decisioner/evaluate/:change_event_id",
  (req: Request, res: Response) => {
    const change_event_id = paramStr(req.params.change_event_id);
    if (!isValidUuid(change_event_id)) {
      return res
        .status(422)
        .json({ detail: "Invalid change_event_id UUID." });
    }

    const change = store.changeEvents.get(change_event_id);
    if (!change) {
      return res.status(404).json({ detail: "ChangeEvent not found." });
    }

    const { candidate, decision_run } = evaluateChangeEvent(change);

    return res.json({
      status: "success",
      candidate,
      decision_run,
    });
  }
);

app.get("/api/candidates", (req: Request, res: Response) => {
  const workspaceId = req.query.workspace_id
    ? String(req.query.workspace_id)
    : undefined;
  const tier = req.query.tier ? String(req.query.tier).toUpperCase() : undefined;
  const status = req.query.status
    ? String(req.query.status).toUpperCase()
    : undefined;
  const rawLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
    : 50;

  let items = Array.from(store.launchCandidates.values());
  if (workspaceId) {
    items = items.filter((c) => c.workspace_id === workspaceId);
  }
  if (tier && tier !== "ALL") {
    items = items.filter((c) => (c.confirmed_tier || c.tier) === tier);
  }
  if (status) {
    items = items.filter((c) => c.status === status);
  }

  items = items
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);

  res.json({
    count: items.length,
    items: items.map((c) => {
      const ch = store.changeEvents.get(c.change_event_id);
      const draftsCount = Array.from(store.gtmDrafts.values()).filter(
        (d) => d.launch_candidate_id === c.id
      ).length;
      return {
        ...c,
        change_anchor_ref: ch?.anchor_ref || "unknown",
        change_title: ch?.title || "Untitled Change",
        change_state: ch?.state || "discovered",
        change_availability: ch?.availability || "unknown",
        drafts_count: draftsCount,
      };
    }),
  });
});

app.get("/api/candidates/:candidate_id", (req: Request, res: Response) => {
  const candidate_id = paramStr(req.params.candidate_id);
  if (!isValidUuid(candidate_id)) {
    return res.status(422).json({ detail: "Invalid candidate_id UUID." });
  }

  const candidate = store.launchCandidates.get(candidate_id);
  if (!candidate) {
    return res.status(404).json({ detail: "LaunchCandidate not found." });
  }

  const changeEvent = store.changeEvents.get(candidate.change_event_id) || null;
  const memberships = store.changeMemberships.filter(
    (m) => m.change_event_id === candidate.change_event_id
  );
  const runs = store.decisionRuns.filter(
    (r) => r.launch_candidate_id === candidate.id
  );
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;

  const drafts = Array.from(store.gtmDrafts.values()).filter(
    (d) => d.launch_candidate_id === candidate.id
  );

  return res.json({
    candidate,
    change_event: changeEvent,
    memberships,
    latest_decision_run: latestRun,
    drafts,
    tier_asset_matrix: getTierAssetMatrix(
      candidate.confirmed_tier || candidate.tier
    ),
  });
});

app.post(
  "/api/candidates/:candidate_id/signoff",
  (req: Request, res: Response) => {
    const candidate_id = paramStr(req.params.candidate_id);
    if (!isValidUuid(candidate_id)) {
      return res.status(422).json({ detail: "Invalid candidate_id UUID." });
    }
    const body = (req.body || {}) as {
      role?: string;
      signed_by?: string;
      notes?: string;
    };
    if (!body.role || !body.signed_by) {
      return res
        .status(422)
        .json({ detail: "Both role and signed_by are required." });
    }

    const updated = addDomainSignoff({
      candidate_id,
      role: body.role.trim(),
      signed_by: body.signed_by.trim(),
      notes: body.notes,
    });
    if (!updated) {
      return res.status(404).json({ detail: "LaunchCandidate not found." });
    }
    return res.json({ status: "signed", candidate: updated });
  }
);

app.post(
  "/api/candidates/:candidate_id/confirm",
  (req: Request, res: Response) => {
    const candidate_id = paramStr(req.params.candidate_id);
    if (!isValidUuid(candidate_id)) {
      return res.status(422).json({ detail: "Invalid candidate_id UUID." });
    }

    const body = (req.body || {}) as {
      confirmed_tier?: string;
      override_reason?: string;
    };
    if (!body.confirmed_tier) {
      return res
        .status(422)
        .json({ detail: "confirmed_tier is required." });
    }

    const result = confirmCandidateTier({
      candidate_id,
      confirmed_tier: body.confirmed_tier,
      override_reason: body.override_reason,
    });
    if (!result.ok) {
      return res.status(result.statusCode).json({
        detail: result.error,
        missing_approvers: result.missing_approvers,
      });
    }

    return res.json({
      candidate_id: result.candidate.id,
      confirmed_tier: result.candidate.confirmed_tier,
      status: result.candidate.status,
      is_external_safe: result.candidate.is_external_safe,
      candidate: result.candidate,
    });
  }
);

app.post(
  "/api/candidates/:candidate_id/reject",
  (req: Request, res: Response) => {
    const candidate_id = paramStr(req.params.candidate_id);
    if (!isValidUuid(candidate_id)) {
      return res.status(422).json({ detail: "Invalid candidate_id UUID." });
    }
    const body = (req.body || {}) as { reason?: string };
    if (!body.reason || body.reason.trim().length < 5) {
      return res.status(422).json({
        detail: "Rejection reason of at least 5 characters is required.",
      });
    }
    const updated = rejectCandidate({
      candidate_id,
      reason: body.reason.trim(),
    });
    if (!updated) {
      return res.status(404).json({ detail: "LaunchCandidate not found." });
    }
    return res.json({ status: "REJECTED", candidate: updated });
  }
);

// ============================================================================
// Stage 4: GTM Asset Generator & 14 Safety Linters Endpoints
// ============================================================================

app.post(
  "/api/candidates/:candidate_id/drafts/generate",
  (req: Request, res: Response) => {
    const candidate_id = paramStr(req.params.candidate_id);
    if (!isValidUuid(candidate_id)) {
      return res.status(422).json({ detail: "Invalid candidate_id UUID." });
    }
    const candidate = store.launchCandidates.get(candidate_id);
    if (!candidate) {
      return res.status(404).json({ detail: "LaunchCandidate not found." });
    }
    const body = (req.body || {}) as { asset_type?: AssetType };
    const drafts = generateDraftsForCandidate(candidate, body.asset_type);
    return res.json({
      candidate_id: candidate.id,
      count: drafts.length,
      drafts,
    });
  }
);

app.put("/api/drafts/:draft_id", (req: Request, res: Response) => {
  const draft_id = paramStr(req.params.draft_id);
  if (!isValidUuid(draft_id)) {
    return res.status(422).json({ detail: "Invalid draft_id UUID." });
  }
  const body = (req.body || {}) as {
    content?: string;
    citations?: string[];
  };
  if (typeof body.content !== "string") {
    return res.status(422).json({ detail: "content string is required." });
  }

  const updated = updateAndRelintDraft({
    draft_id,
    content: body.content,
    citations: body.citations,
  });
  if (!updated) {
    return res.status(404).json({ detail: "GtmDraft not found." });
  }
  return res.json({ status: "relinted", draft: updated });
});

app.post("/api/drafts/:draft_id/override", (req: Request, res: Response) => {
  const draft_id = paramStr(req.params.draft_id);
  if (!isValidUuid(draft_id)) {
    return res.status(422).json({ detail: "Invalid draft_id UUID." });
  }
  const body = (req.body || {}) as { rule_code?: LintCode; reason?: string };
  if (!body.rule_code) {
    return res.status(422).json({ detail: "rule_code is required." });
  }

  const result = overrideLintFinding({
    draft_id,
    rule_code: body.rule_code,
    reason: body.reason || "",
  });
  if (!result.ok) {
    return res.status(result.statusCode).json({ detail: result.error });
  }
  return res.json({ status: "overridden", draft: result.draft });
});

// ============================================================================
// Brand Profile, Demo Reset & VS Code Extension Metadata
// ============================================================================

app.get("/api/brand", (_req: Request, res: Response) => {
  res.json(store.brandProfile);
});

app.put("/api/brand", (req: Request, res: Response) => {
  const body = (req.body || {}) as Partial<BrandProfile>;
  if (typeof body.product_summary === "string") {
    store.brandProfile.product_summary = body.product_summary;
  }
  if (typeof body.voice_tone === "string") {
    store.brandProfile.voice_tone = body.voice_tone;
  }
  if (Array.isArray(body.codenames)) {
    store.brandProfile.codenames = body.codenames.map(String).filter(Boolean);
  }
  if (Array.isArray(body.competitors)) {
    store.brandProfile.competitors = body.competitors.map(String).filter(Boolean);
  }
  if (Array.isArray(body.disallowed_claims)) {
    store.brandProfile.disallowed_claims = body.disallowed_claims
      .map(String)
      .filter(Boolean);
  }
  persistStore();
  res.json(store.brandProfile);
});

app.get("/api/extension/manifest", (_req: Request, res: Response) => {
  try {
    const extPkgPath = path.resolve(
      process.cwd(),
      "vscode-extension",
      "package.json"
    );
    const extSrcPath = path.resolve(
      process.cwd(),
      "vscode-extension",
      "src",
      "extension.ts"
    );
    const pkg = fs.existsSync(extPkgPath)
      ? JSON.parse(fs.readFileSync(extPkgPath, "utf8"))
      : null;
    const entryPreview = fs.existsSync(extSrcPath)
      ? fs.readFileSync(extSrcPath, "utf8").slice(0, 1800)
      : "";
    res.json({
      available: Boolean(pkg),
      package_json: pkg,
      extension_entry_preview: entryPreview,
      install_commands: [
        "cd vscode-extension",
        "npm install && npm run compile",
        "code --extensionDevelopmentPath=.",
      ],
    });
  } catch (err) {
    res.status(500).json({ detail: "Failed to read VS Code extension files." });
  }
});

app.post("/api/demo/reset", (_req: Request, res: Response) => {
  const statePath = path.resolve(process.cwd(), "data", "launchgraph-state.json");
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }
  clearStore();
  initStore(false);
  seedDemoPipeline();
  res.json({
    status: "reset",
    counts: {
      source_events: store.sourceEvents.size,
      change_events: store.changeEvents.size,
      launch_candidates: store.launchCandidates.size,
      gtm_drafts: store.gtmDrafts.size,
      pending_triage: store.linkSuggestions.filter(
        (ls) => ls.status === "pending"
      ).length,
    },
  });
});

// Malformed JSON error handler
app.use(
  (
    err: Error & { status?: number; type?: string },
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (err && (err.type === "entity.parse.failed" || err.status === 400)) {
      return res.status(400).json({ detail: "Invalid JSON payload." });
    }
    return next(err);
  }
);

async function startServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const clientDist = path.resolve(process.cwd(), "dist", "client");
  const indexHtml = path.join(clientDist, "index.html");

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/webhooks/")) {
        return next();
      }
      return vite.middlewares(req, res, next);
    });
  } else {
    app.use(express.static(clientDist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/api/") ||
        req.path.startsWith("/webhooks/")
      ) {
        return next();
      }
      if (fs.existsSync(indexHtml)) {
        return res.sendFile(indexHtml);
      }
      return res.status(503).json({
        detail: "Frontend build not found. Run npm run build first.",
      });
    });
  }

  app.listen(settings.PORT, settings.HOST, () => {
    console.log(
      `LaunchGraph Node.js API & VS Code Extension Workbench listening on http://${settings.HOST}:${settings.PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error("[LaunchGraph] Failed to start server:", err);
  process.exit(1);
});
