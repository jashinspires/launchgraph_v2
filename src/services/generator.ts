import crypto from "node:crypto";
import { SecretScrubber, REDACTION_MARKER } from "../security/scrubber.js";
import { persistStore, store } from "../store.js";
import {
  AssetType,
  EvidencePack,
  GtmDraft,
  LaunchCandidate,
  LaunchTier,
  LintCode,
  PreFlightReport,
} from "../types.js";
import {
  recomputeCandidateExternalSafety,
  SensitivityDetector,
} from "./decisioner.js";
import { SafetyLinterEngine } from "./linters.js";
import {
  AnchorResolver,
  LinkTypingEngine,
  ReferenceExtractor,
} from "./normalizer.js";

export function getTierAssetMatrix(tier: string): AssetType[] {
  switch (tier.toUpperCase()) {
    case LaunchTier.T0:
      return ["INTERNAL_BRIEF"];
    case LaunchTier.T1:
      return [
        "CHANGELOG",
        "EMAIL",
        "LINKEDIN",
        "SALES_SNIPPET",
        "SUPPORT_FAQ",
        "INTERNAL_BRIEF",
        "PRODUCT_BLOG",
      ];
    case LaunchTier.T2:
      return [
        "CHANGELOG",
        "EMAIL",
        "SALES_SNIPPET",
        "SUPPORT_FAQ",
        "INTERNAL_BRIEF",
      ];
    case LaunchTier.T3:
    default:
      return ["CHANGELOG", "RELEASE_NOTE"];
  }
}

function buildEvidenceGroundedContent(params: {
  asset_type: AssetType;
  title: string;
  anchor_ref: string;
  tier: string;
  description: string | null;
  citations: string[];
  is_breaking: boolean;
}): { draftTitle: string; content: string } {
  const {
    asset_type,
    title,
    anchor_ref,
    tier,
    description,
    citations,
    is_breaking,
  } = params;
  const citeTag = citations.length > 0 ? `[${citations[0]}]` : "[chk_facts_001]";
  const cleanSummary =
    (description || title)
      .replace(/\[REDACTED_SECRET\]/g, "(redacted credential)")
      .trim() || title;

  const migrationNote = is_breaking
    ? "\n\nMigration Guidance: Review updated API signatures and upgrade clients before deploying."
    : "";

  switch (asset_type) {
    case "INTERNAL_BRIEF":
      return {
        draftTitle: `Internal Release Brief: ${title}`,
        content: `## Internal Release Brief (${anchor_ref} · ${tier})\n\nSummary: ${cleanSummary} ${citeTag}${migrationNote}\n\nNote: This brief is scoped for internal engineering and PMM visibility.`,
      };
    case "CHANGELOG":
      return {
        draftTitle: `Changelog: ${title}`,
        content: `### ${title}\n\n${cleanSummary} (${anchor_ref}, ${citeTag}).${migrationNote}`,
      };
    case "RELEASE_NOTE":
      return {
        draftTitle: `Release Note: ${title}`,
        content: `## Release Note (${anchor_ref})\n\n- **Update**: ${title} ${citeTag}\n- **Details**: ${cleanSummary}${migrationNote}`,
      };
    case "EMAIL":
      return {
        draftTitle: `Customer Update: ${title}`,
        content: `Subject: Product Update — ${title}\n\nHello,\n\nWe shipped ${title} (${anchor_ref}) ${citeTag}.\n\n${cleanSummary}${migrationNote}\n\nBest,\nThe LaunchGraph Team`,
      };
    case "LINKEDIN":
      return {
        draftTitle: `LinkedIn Post: ${title}`,
        content: `We just shipped ${title} (${anchor_ref}) ${citeTag}.\n\n${cleanSummary}${migrationNote}`,
      };
    case "SALES_SNIPPET":
      return {
        draftTitle: `Sales Enablement Snippet: ${title}`,
        content: `### Sales Talking Point (${anchor_ref})\n\nCustomer Value: ${cleanSummary} ${citeTag}.${migrationNote}`,
      };
    case "SUPPORT_FAQ":
      return {
        draftTitle: `Support FAQ: ${title}`,
        content: `### Q: What changed in ${title}?\n\nA: ${cleanSummary} (${anchor_ref}, ${citeTag}).${migrationNote}`,
      };
    case "PRODUCT_BLOG":
      return {
        draftTitle: `Product Announcement: ${title}`,
        content: `# ${title}\n\n${cleanSummary} ${citeTag}.${migrationNote}\n\nAll assertions trace directly to verified engineering evidence (${anchor_ref}).`,
      };
    case "X_THREAD":
      return {
        draftTitle: `X Post: ${title}`,
        content: `Shipped: ${title} (${anchor_ref}) ${citeTag}. ${cleanSummary.slice(0, 140)}`,
      };
  }
}

export function generateDraftsForCandidate(
  candidate: LaunchCandidate,
  requestedAssetType?: AssetType
): GtmDraft[] {
  const changeEvent = store.changeEvents.get(candidate.change_event_id);
  if (!changeEvent) return [];

  const runs = store.decisionRuns.filter(
    (r) => r.launch_candidate_id === candidate.id
  );
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
  const evidencePack: EvidencePack | undefined = latestRun?.evidence_pack;
  const citations = evidencePack
    ? evidencePack.chunks.map((c) => c.chunk_id)
    : ["chk_facts_001"];

  const activeTier = candidate.confirmed_tier || candidate.tier;
  const assetTypes = requestedAssetType
    ? [requestedAssetType]
    : getTierAssetMatrix(activeTier);

  const sensitivity = SensitivityDetector.scanChangeContext({
    title: changeEvent.title,
    description: changeEvent.description,
  });

  const isBreaking = Boolean(
    latestRun?.evidence_pack?.chunks[0]?.content.includes(
      "Breaking Change: True"
    )
  );
  const signedRoles = new Set(candidate.domain_signoffs.map((s) => s.role));

  const createdOrUpdated: GtmDraft[] = [];
  const now = new Date().toISOString();

  for (const assetType of assetTypes) {
    let existing: GtmDraft | undefined;
    for (const d of store.gtmDrafts.values()) {
      if (
        d.launch_candidate_id === candidate.id &&
        d.asset_type === assetType
      ) {
        existing = d;
        break;
      }
    }

    const { draftTitle, content } = buildEvidenceGroundedContent({
      asset_type: assetType,
      title: changeEvent.title,
      anchor_ref: changeEvent.anchor_ref,
      tier: activeTier,
      description: changeEvent.description,
      citations,
      is_breaking: isBreaking,
    });

    const finalContent = existing ? existing.content : content;
    const finalTitle = existing ? existing.title : draftTitle;

    const existingOverrides = new Map<
      LintCode,
      { is_overridden: boolean; override_reason?: string }
    >();
    if (existing) {
      for (const f of existing.lint_findings) {
        if (f.is_overridden) {
          existingOverrides.set(f.rule_code, {
            is_overridden: true,
            override_reason: f.override_reason,
          });
        }
      }
    }

    const lintFindings = SafetyLinterEngine.runAll14Linters({
      content: finalContent,
      asset_type: assetType,
      citations,
      brand_profile: store.brandProfile,
      evidence_pack: evidencePack,
      sensitivity,
      is_breaking_change: isBreaking,
      has_pricing_approval: signedRoles.has("gtm_vp"),
      has_compliance_approval: signedRoles.has("compliance_officer"),
      existing_overrides: existingOverrides,
    });

    const isExternalSafe =
      assetType === "INTERNAL_BRIEF" ||
      !SafetyLinterEngine.hasUnresolvedBlockersOrWarnings(lintFindings);

    if (existing) {
      existing.lint_findings = lintFindings;
      existing.is_external_safe = isExternalSafe;
      existing.updated_at = now;
      createdOrUpdated.push(existing);
    } else {
      const draft: GtmDraft = {
        id: crypto.randomUUID(),
        workspace_id: candidate.workspace_id,
        launch_candidate_id: candidate.id,
        asset_type: assetType,
        title: finalTitle,
        content: finalContent,
        citations,
        lint_findings: lintFindings,
        is_external_safe: isExternalSafe,
        created_at: now,
        updated_at: now,
      };
      store.gtmDrafts.set(draft.id, draft);
      createdOrUpdated.push(draft);
    }
  }

  recomputeCandidateExternalSafety(candidate);
  persistStore();
  return createdOrUpdated;
}

export function updateAndRelintDraft(params: {
  draft_id: string;
  content: string;
  citations?: string[];
}): GtmDraft | null {
  const draft = store.gtmDrafts.get(params.draft_id);
  if (!draft) return null;

  const candidate = store.launchCandidates.get(draft.launch_candidate_id);
  const changeEvent = candidate
    ? store.changeEvents.get(candidate.change_event_id)
    : undefined;
  const runs = candidate
    ? store.decisionRuns.filter((r) => r.launch_candidate_id === candidate.id)
    : [];
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : undefined;

  const sensitivity = changeEvent
    ? SensitivityDetector.scanChangeContext({
        title: changeEvent.title,
        description: changeEvent.description,
      })
    : undefined;

  const isBreaking = Boolean(
    latestRun?.evidence_pack?.chunks[0]?.content.includes(
      "Breaking Change: True"
    )
  );
  const signedRoles = new Set(
    candidate ? candidate.domain_signoffs.map((s) => s.role) : []
  );

  const existingOverrides = new Map<
    LintCode,
    { is_overridden: boolean; override_reason?: string }
  >();
  for (const f of draft.lint_findings) {
    if (f.is_overridden) {
      existingOverrides.set(f.rule_code, {
        is_overridden: true,
        override_reason: f.override_reason,
      });
    }
  }

  draft.content = params.content;
  if (params.citations) draft.citations = params.citations;
  draft.lint_findings = SafetyLinterEngine.runAll14Linters({
    content: draft.content,
    asset_type: draft.asset_type,
    citations: draft.citations,
    brand_profile: store.brandProfile,
    evidence_pack: latestRun?.evidence_pack,
    sensitivity,
    is_breaking_change: isBreaking,
    has_pricing_approval: signedRoles.has("gtm_vp"),
    has_compliance_approval: signedRoles.has("compliance_officer"),
    existing_overrides: existingOverrides,
  });
  draft.is_external_safe =
    draft.asset_type === "INTERNAL_BRIEF" ||
    !SafetyLinterEngine.hasUnresolvedBlockersOrWarnings(draft.lint_findings);
  draft.updated_at = new Date().toISOString();

  if (candidate) {
    recomputeCandidateExternalSafety(candidate);
  }
  persistStore();
  return draft;
}

export function overrideLintFinding(params: {
  draft_id: string;
  rule_code: LintCode;
  reason: string;
}):
  | { ok: true; draft: GtmDraft }
  | { ok: false; statusCode: number; error: string } {
  const draft = store.gtmDrafts.get(params.draft_id);
  if (!draft) {
    return { ok: false, statusCode: 404, error: "GtmDraft not found." };
  }
  if (!params.reason || params.reason.trim().length < 5) {
    return {
      ok: false,
      statusCode: 422,
      error: "Mandatory override rationale of at least 5 characters is required.",
    };
  }

  const finding = draft.lint_findings.find(
    (f) => f.rule_code === params.rule_code
  );
  if (!finding) {
    return { ok: false, statusCode: 404, error: "Lint finding not found." };
  }
  if (finding.severity === "BLOCKER") {
    return {
      ok: false,
      statusCode: 409,
      error: `BLOCKER rule ${finding.rule_code} cannot be overridden; edit the copy to resolve it.`,
    };
  }

  finding.is_overridden = true;
  finding.override_reason = params.reason.trim();
  draft.is_external_safe =
    draft.asset_type === "INTERNAL_BRIEF" ||
    !SafetyLinterEngine.hasUnresolvedBlockersOrWarnings(draft.lint_findings);
  draft.updated_at = new Date().toISOString();

  const candidate = store.launchCandidates.get(draft.launch_candidate_id);
  if (candidate) {
    recomputeCandidateExternalSafety(candidate);
  }
  persistStore();
  return { ok: true, draft };
}

export function runPreFlightScan(params: {
  title: string;
  body: string;
  branch_name?: string;
  source_type?: "GITHUB" | "JIRA" | "SLACK";
  draft_copy?: string;
  asset_type?: AssetType;
}): PreFlightReport {
  const {
    title,
    body,
    branch_name,
    source_type = "GITHUB",
    draft_copy,
    asset_type = "CHANGELOG",
  } = params;

  const combined = `${title}\n${body}`;
  const scrubbedText = SecretScrubber.scrubText(combined);
  const redactionMatches = scrubbedText.match(
    new RegExp(REDACTION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
  );
  const redactionCount = redactionMatches ? redactionMatches.length : 0;

  const refs = ReferenceExtractor.extractFromText(
    `${title} ${body} ${branch_name || ""}`
  );
  const predictedLinkType = LinkTypingEngine.determineLinkType({
    title,
    body,
    branch_name,
  });
  const { anchor_ref: predictedAnchorRef } = AnchorResolver.predictAnchorRef({
    source_type,
    external_id:
      refs.pr_numbers.length > 0
        ? `PR-${refs.pr_numbers[0]}`
        : refs.jira_keys.length > 0
          ? `JIRA:${refs.jira_keys[0]}`
          : "UNANCHORED-DRAFT",
    title,
    description: body,
  });

  const sensitivity = SensitivityDetector.scanChangeContext({
    title,
    description: body,
  });

  const lintFindings = draft_copy
    ? SafetyLinterEngine.runAll14Linters({
        content: draft_copy,
        asset_type,
        citations: ["chk_facts_001"],
        brand_profile: store.brandProfile,
        sensitivity,
      })
    : [];

  const hasBlockerLints = lintFindings.some((f) => f.severity === "BLOCKER");

  return {
    secrets: {
      has_leaks: redactionCount > 0,
      scrubbed_text: scrubbedText,
      redaction_count: redactionCount,
    },
    references: {
      jira_keys: refs.jira_keys,
      pr_numbers: refs.pr_numbers,
      commit_shas: refs.commit_shas,
      predicted_link_type: predictedLinkType,
      predicted_anchor_ref: predictedAnchorRef,
    },
    sensitivity: {
      security_flags: sensitivity.security_flags,
      customer_nda_detected: sensitivity.customer_nda_detected,
      compliance_flag: sensitivity.compliance_flag,
      pricing_impact: sensitivity.pricing_impact,
      is_embargoed: sensitivity.is_embargoed,
      summary_findings: sensitivity.summary_findings,
    },
    lint_findings: lintFindings,
    ready_for_push: redactionCount === 0 && !hasBlockerLints,
  };
}
