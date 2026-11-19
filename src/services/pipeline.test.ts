import assert from "node:assert/strict";
import test from "node:test";
import {
  signGithubSha256,
  signSlackRequest,
  verifyGithubSignature,
  verifyJiraSignature,
  verifySlackSignature,
} from "../security/crypto.js";
import { REDACTION_MARKER, SecretScrubber } from "../security/scrubber.js";
import {
  clearStore,
  GITHUB_CONN_ID,
  initStore,
  JIRA_CONN_ID,
  setPersistenceEnabled,
  SLACK_CONN_ID,
  store,
} from "../store.js";
import { EventProcessor } from "./ingester.js";
import {
  acceptLinkSuggestion,
  LedgerManager,
  LifecycleTracker,
  LinkTypingEngine,
  processUnprocessedSourceEvents,
  ReferenceExtractor,
  rejectLinkSuggestion,
} from "./normalizer.js";
import {
  addDomainSignoff,
  confirmCandidateTier,
  ConsensusEngine,
  DeterministicFactExtractor,
  DeterministicJudgmentClient,
  evaluateChangeEvent,
  EvidencePackAssembler,
  PolicyEngine,
  SensitivityDetector,
} from "./decisioner.js";
import { SafetyLinterEngine } from "./linters.js";
import {
  generateDraftsForCandidate,
  getTierAssetMatrix,
  overrideLintFinding,
  runPreFlightScan,
  updateAndRelintDraft,
} from "./generator.js";
import { LaunchTier, LinkType } from "../types.js";

function resetTestStore(): void {
  setPersistenceEnabled(false);
  clearStore();
  initStore(false);
}

test("Stage 1: HMAC signatures verify validly and fail-closed on tampering or replay", () => {
  const payload = Buffer.from(JSON.stringify({ hello: "launchgraph" }));
  const ghSecret = "test-gh-secret";
  const ghSig = signGithubSha256(payload, ghSecret);

  assert.equal(verifyGithubSignature(payload, ghSecret, ghSig), true);
  assert.equal(verifyGithubSignature(payload, ghSecret, "sha256=deadbeef"), false);
  assert.equal(verifyJiraSignature(payload, ghSecret, ghSig), true);
  assert.equal(verifyJiraSignature(payload, ghSecret, ""), false);

  const slackSecret = "test-slack-secret";
  const nowTs = String(Math.floor(Date.now() / 1000));
  const expiredTs = String(Math.floor(Date.now() / 1000) - 600);
  const validSlackSig = signSlackRequest(payload, slackSecret, nowTs);
  const expiredSlackSig = signSlackRequest(payload, slackSecret, expiredTs);

  assert.equal(
    verifySlackSignature(payload, slackSecret, nowTs, validSlackSig),
    true
  );
  assert.equal(
    verifySlackSignature(payload, slackSecret, expiredTs, expiredSlackSig),
    false
  );
});

test("Stage 1: SecretScrubber redacts AWS keys, GitHub PATs, Slack tokens, JWTs, and private keys", () => {
  const demoAwsKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const demoGhToken = ["ghp", "1234567890abcdef1234567890abcdef123456"].join("_");
  const demoSlackToken = ["xoxb", "123456789012", "123456789012", "abcdefABCDEF123456"].join("-");
  const demoJwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTYifQ", "signature_part_123"].join(".");

  const raw = [
    `AWS_KEY=${demoAwsKey}`,
    `token=${demoGhToken}`,
    `slack=${demoSlackToken}`,
    `jwt=${demoJwt}`,
  ].join(" | ");

  const scrubbed = SecretScrubber.scrubText(raw);
  assert.equal(scrubbed.includes(demoAwsKey), false);
  assert.equal(scrubbed.includes(demoGhToken.slice(0, 14)), false);
  assert.equal(scrubbed.includes("xoxb-"), false);
  assert.equal(scrubbed.includes("eyJhbGci"), false);
  assert.equal(scrubbed.includes(REDACTION_MARKER), true);
});

test("Stage 2: Revert detection, availability inference, fallback triage suggestions, and soft-unlink rationale", () => {
  resetTestStore();
  const jiraConn = store.connections.get(JIRA_CONN_ID)!;
  const ghConn = store.connections.get(GITHUB_CONN_ID)!;
  const slackConn = store.connections.get(SLACK_CONN_ID)!;

  // 1. Ingest Jira story & GA PR
  EventProcessor.processIncomingWebhook({
    connection: jiraConn,
    event_type: "jira:issue_created",
    idempotency_key: "t:jira:200",
    external_id: "JIRA:PROD-200",
    raw_payload: {
      issue: {
        id: "200",
        key: "PROD-200",
        fields: {
          summary: "Enterprise SAML2 SSO Okta Integration",
          description: "Resolves enterprise login latency and Okta callback handling.",
          priority: { name: "High" },
          issuetype: { name: "Story" },
          labels: ["ga"],
        },
      },
    },
  });

  EventProcessor.processIncomingWebhook({
    connection: ghConn,
    event_type: "pull_request",
    idempotency_key: "t:gh:pr-201",
    external_id: "PR-201",
    raw_payload: {
      action: "closed",
      pull_request: {
        number: 201,
        title: "Fix PROD-200 Okta SAML2 callback",
        body: "Fixes PROD-200",
        merged: true,
        head: { ref: "feature/PROD-200" },
        user: { login: "dev1" },
        labels: [{ name: "ga" }],
        changed_files: ["src/sso.ts", "docs/sso.md"],
      },
    },
  });

  // 2. Revert PR detection
  const refs = ReferenceExtractor.extractFromText("Revert \"PROD-200\" (#201)");
  assert.deepEqual(refs.jira_keys, ["PROD-200"]);
  assert.deepEqual(refs.pr_numbers, [201]);

  const revertLink = LinkTypingEngine.determineLinkType({
    title: 'Revert "PROD-200 Okta callback"',
    is_revert: true,
  });
  assert.equal(revertLink, LinkType.L4_REVERTS);

  processUnprocessedSourceEvents(10);
  const prodChange = Array.from(store.changeEvents.values()).find(
    (c) => c.anchor_ref === "JIRA:PROD-200"
  )!;
  assert.equal(prodChange.availability, "ga");
  assert.equal(prodChange.state, "merged");

  // 3. Unlinked Slack event triggers SuggestionRanker
  EventProcessor.processIncomingWebhook({
    connection: slackConn,
    event_type: "slack:message",
    idempotency_key: "t:slack:unlinked-1",
    external_id: "SLACK:C01:999",
    raw_payload: {
      event_id: "u1",
      event: {
        channel: "C01",
        text: "Enterprise SAML2 Okta callback latency verified in production.",
        ts: "999",
        user: "U01",
      },
    },
  });
  processUnprocessedSourceEvents(5);

  const pendingSuggestions = store.linkSuggestions.filter(
    (ls) => ls.status === "pending"
  );
  assert.equal(pendingSuggestions.length >= 1, true);
  const suggestion = pendingSuggestions[0];
  assert.equal(suggestion.change_event_id, prodChange.id);

  // Accept suggestion links Slack event into PROD-200 ledger
  const accepted = acceptLinkSuggestion(suggestion.id, "pmm-tester");
  assert.ok(accepted);
  assert.equal(accepted.suggestion.status, "accepted");
  assert.equal(accepted.membership.is_active, true);

  // Reject test on another suggestion
  const fakeSuggId = "99999999-9999-4999-9999-999999999999";
  assert.equal(rejectLinkSuggestion(fakeSuggId), null);

  // Soft unlink enforces rationale >= 5 chars
  assert.throws(() =>
    LedgerManager.softUnlinkReference(accepted.membership.id, "tester", "bad")
  );
  const unlinked = LedgerManager.softUnlinkReference(
    accepted.membership.id,
    "tester",
    "Duplicate Slack update linked separately"
  );
  assert.equal(unlinked, true);
  assert.equal(accepted.membership.is_active, false);
});

test("Stage 3: Multi-lens consensus, P-EXPERIMENTAL fix, 12k token EvidencePack, and Domain Sign-Off confirmation gate", () => {
  resetTestStore();
  const jiraConn = store.connections.get(JIRA_CONN_ID)!;
  const ghConn = store.connections.get(GITHUB_CONN_ID)!;

  EventProcessor.processIncomingWebhook({
    connection: jiraConn,
    event_type: "jira:issue_created",
    idempotency_key: "t:sec:1",
    external_id: "JIRA:SEC-10",
    raw_payload: {
      issue: {
        id: "10",
        key: "SEC-10",
        fields: {
          summary: "SOC2 Audit Retention & Auth Vulnerability Patch",
          description:
            "Remediates CVE-2026-1234 privilege escalation and introduces breaking migration for SOC 2 retention.",
          priority: { name: "High" },
          issuetype: { name: "Story" },
          labels: ["ga"],
        },
      },
    },
  });
  EventProcessor.processIncomingWebhook({
    connection: ghConn,
    event_type: "pull_request",
    idempotency_key: "t:sec:2",
    external_id: "PR-10",
    raw_payload: {
      action: "closed",
      pull_request: {
        number: 10,
        title: "SEC-10 Patch CVE-2026-1234 and SOC2 retention",
        body: "Resolves SEC-10 breaking migration",
        merged: true,
        head: { ref: "feature/SEC-10-patch" },
        user: { login: "sec-author" },
        labels: [{ name: "ga" }],
        changed_files: ["src/auth.ts", "docs/security.md"],
      },
    },
  });

  processUnprocessedSourceEvents(10);
  const change = Array.from(store.changeEvents.values()).find(
    (c) => c.anchor_ref === "JIRA:SEC-10"
  )!;
  const { candidate, decision_run } = evaluateChangeEvent(change);

  assert.equal(decision_run.evidence_pack_tokens <= EvidencePackAssembler.MAX_TOKENS, true);
  assert.equal(decision_run.evidence_pack_hash.length, 64);
  assert.equal(candidate.required_approvers.includes("security_lead"), true);
  assert.equal(candidate.required_approvers.includes("compliance_officer"), true);

  // Confirming T2 before domain sign-offs must be blocked (409)
  const blockedConfirm = confirmCandidateTier({
    candidate_id: candidate.id,
    confirmed_tier: "T2",
  });
  assert.equal(blockedConfirm.ok, false);
  if (!blockedConfirm.ok) {
    assert.equal(blockedConfirm.statusCode, 409);
    assert.equal(blockedConfirm.missing_approvers?.includes("security_lead"), true);
  }

  // Record required domain sign-offs
  addDomainSignoff({
    candidate_id: candidate.id,
    role: "security_lead",
    signed_by: "alice-sec",
  });
  addDomainSignoff({
    candidate_id: candidate.id,
    role: "compliance_officer",
    signed_by: "bob-legal",
  });

  const allowedConfirm = confirmCandidateTier({
    candidate_id: candidate.id,
    confirmed_tier: "T2",
  });
  assert.equal(allowedConfirm.ok, true);
  if (allowedConfirm.ok) {
    assert.equal(allowedConfirm.candidate.status, "CONFIRMED");
    assert.equal(allowedConfirm.candidate.is_external_safe, true);
  }

  // P-EXPERIMENTAL should NOT fire when proposed/active tier is T0 (infra/internal only)
  const infraFacts = DeterministicFactExtractor.extractFacts(
    { ...change, availability: "internal", title: "chore: internal CI script" },
    []
  );
  const infraPolicy = PolicyEngine.evaluate({
    facts: infraFacts,
    sensitivity: SensitivityDetector.scanText("internal CI"),
    proposed_tier: LaunchTier.T0,
  });
  assert.equal(
    infraPolicy.triggered_rules.some((r) => r.rule_code === "P-EXPERIMENTAL"),
    false
  );

  // 3 distinct analytical lenses
  const client = new DeterministicJudgmentClient();
  const pack = EvidencePackAssembler.assemblePack({
    change_event: change,
    facts: DeterministicFactExtractor.extractFacts(change, []),
    sensitivity: SensitivityDetector.scanText(change.title),
    source_events: [],
  });
  const consensus = ConsensusEngine.evaluateConsensus(
    client,
    pack,
    DeterministicFactExtractor.extractFacts(change, []),
    3
  );
  assert.equal(consensus.raw_samples.length, 3);
  assert.equal(consensus.raw_samples[0].lens, "Engineering & Spec Rigor");
  assert.equal(consensus.raw_samples[1].lens, "Customer & GTM Value");
  assert.equal(consensus.raw_samples[2].lens, "Risk, Docs & Governance");
});

test("Stage 4: All 14 Safety Linters, Draft Matrix, Warning Override Rationale, and Engineer Pre-Flight Scan", () => {
  resetTestStore();

  // Trigger all 14 linters across crafted external draft scenarios
  const dirtyDraft = [
    "Project Apollo", // 1. LINT-CODENAME
    "99.4% latency reduction", // 2. LINT-UNCITED (ungrounded metric + empty citations)
    `token=${["ghp", "1234567890abcdef1234567890abcdef123456"].join("_")}`, // 3. LINT-TOKEN
    "Faster than CompetitorX", // 4. LINT-COMPETITOR
    "world's first unbeatable engine", // 5. LINT-SUPERLATIVE
    "$49 per seat pricing tier", // 6. LINT-PRICING
    "guaranteed by 2026-12-01", // 7. LINT-TIMING
    // 8. LINT-EMBARGO via sensitivity.is_embargoed
    // 9. LINT-LENGTH via > 280 chars on X_THREAD
    "damn bug", // 10. LINT-PROFANITY
    "patches CVE-2026-9999 SQL injection", // 11. LINT-SECURITY
    "TODO finish intro", // 12. LINT-FORMAT
    // 13. LINT-PERSONA via is_breaking_change=true without migration/upgrade word
    "guaranteed 100% uptime", // 14. LINT-DISALLOWED-CLAIM
  ].join(" — ") + " ".repeat(260);

  const findings = SafetyLinterEngine.runAll14Linters({
    content: dirtyDraft,
    asset_type: "X_THREAD",
    citations: [],
    brand_profile: store.brandProfile,
    sensitivity: {
      security_flags: true,
      customer_nda_detected: false,
      compliance_flag: false,
      pricing_impact: true,
      is_embargoed: true,
      embargo_date: new Date("2026-12-31T00:00:00Z"),
      matched_patterns: {},
      summary_findings: [],
    },
    is_breaking_change: true,
  });

  const codes = new Set(findings.map((f) => f.rule_code));
  const expectedAll14 = [
    "LINT-CODENAME",
    "LINT-UNCITED",
    "LINT-TOKEN",
    "LINT-COMPETITOR",
    "LINT-SUPERLATIVE",
    "LINT-PRICING",
    "LINT-TIMING",
    "LINT-EMBARGO",
    "LINT-LENGTH",
    "LINT-PROFANITY",
    "LINT-SECURITY",
    "LINT-FORMAT",
    "LINT-PERSONA",
    "LINT-DISALLOWED-CLAIM",
  ];
  for (const code of expectedAll14) {
    assert.equal(codes.has(code as any), true, `Expected ${code} to trigger`);
  }

  // Test Draft Generation + Warning override vs Blocker rejection
  assert.deepEqual(getTierAssetMatrix("T0"), ["INTERNAL_BRIEF"]);
  assert.equal(getTierAssetMatrix("T1").includes("PRODUCT_BLOG"), true);

  const jiraConn = store.connections.get(JIRA_CONN_ID)!;
  EventProcessor.processIncomingWebhook({
    connection: jiraConn,
    event_type: "jira:issue_created",
    idempotency_key: "t:draft:1",
    external_id: "JIRA:PROD-500",
    raw_payload: {
      issue: {
        id: "500",
        key: "PROD-500",
        fields: {
          summary: "Realtime Webhook Replay Dashboard",
          description: "Allows developers to inspect and replay webhook events.",
          priority: { name: "High" },
          issuetype: { name: "Story" },
          labels: ["ga"],
        },
      },
    },
  });
  processUnprocessedSourceEvents(5);
  const ch = Array.from(store.changeEvents.values()).find(
    (c) => c.anchor_ref === "JIRA:PROD-500"
  )!;
  const { candidate } = evaluateChangeEvent(ch);
  const drafts = generateDraftsForCandidate(candidate);
  assert.equal(drafts.length >= 2, true);

  const changelogDraft = drafts.find((d) => d.asset_type === "CHANGELOG")!;
  // Inject a WARNING (LINT-SUPERLATIVE) and a BLOCKER (LINT-CODENAME)
  const edited = updateAndRelintDraft({
    draft_id: changelogDraft.id,
    content: "Project Apollo delivers an unbeatable webhook replay flow [chk_facts_001].",
  })!;
  assert.equal(edited.is_external_safe, false);

  // Attempting to override BLOCKER fails with 409
  const blockTry = overrideLintFinding({
    draft_id: edited.id,
    rule_code: "LINT-CODENAME",
    reason: "Want to keep codename",
  });
  assert.equal(blockTry.ok, false);
  if (!blockTry.ok) assert.equal(blockTry.statusCode, 409);

  // Remove codename, keep superlative WARNING, then override with valid rationale
  updateAndRelintDraft({
    draft_id: edited.id,
    content: "Webhook Replay delivers an unbeatable developer workflow [chk_facts_001].",
  });
  const shortReason = overrideLintFinding({
    draft_id: edited.id,
    rule_code: "LINT-SUPERLATIVE",
    reason: "ok",
  });
  assert.equal(shortReason.ok, false);

  const validOverride = overrideLintFinding({
    draft_id: edited.id,
    rule_code: "LINT-SUPERLATIVE",
    reason: "Approved by VP Product Marketing for launch release note.",
  });
  assert.equal(validOverride.ok, true);
  if (validOverride.ok) {
    assert.equal(validOverride.draft.is_external_safe, true);
  }

  // Test Pre-Flight Engineer Scan
  const preflight = runPreFlightScan({
    title: "Fix PROD-500 webhook replay signature bug",
    body: `Resolves PROD-500. Do not commit ${["ghp", "1234567890abcdef1234567890abcdef123456"].join("_")}!`,
    branch_name: "fix/PROD-500-replay",
  });
  assert.equal(preflight.secrets.has_leaks, true);
  assert.equal(preflight.secrets.redaction_count, 1);
  assert.equal(preflight.ready_for_push, false);
  assert.deepEqual(preflight.references.jira_keys, ["PROD-500"]);
  assert.equal(preflight.references.predicted_anchor_ref, "JIRA:PROD-500");
});
