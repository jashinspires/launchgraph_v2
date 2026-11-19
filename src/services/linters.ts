import crypto from "node:crypto";
import { SecretScrubber, REDACTION_MARKER } from "../security/scrubber.js";
import {
  AssetType,
  BrandProfile,
  EvidencePack,
  LintCode,
  LintFinding,
} from "../types.js";
import { SensitivityFindings } from "./decisioner.js";

const PROFANITY_PATTERN =
  /\b(damn|hell|crap|shit|fuck|bitch|asshole|sucks|garbage)\b/i;

const SUPERLATIVE_PATTERN =
  /\b(best-in-class|world'?s first|#1|number one|unbeatable|revolutionary|game-changing|fastest ever|zero latency)\b/i;

const PRICING_PATTERN =
  /(\$\d+|\bfree tier\b|\bprice increase\b|\bdiscount\b|\bpricing tier\b|\bper seat\b)/i;

const TIMING_PATTERN =
  /\b(ships tomorrow|guaranteed by|eta friday|launching on \d{4}-\d{2}-\d{2}|will definitely ship)\b/i;

const SECURITY_DISCLOSURE_PATTERN =
  /\b(CVE-\d{4}-\d{4,7}|SQL injection|remote code execution|RCE|zero-day|exploit payload|buffer overflow)\b/i;

const UNGROUNDED_METRIC_PATTERN = /\b(\d{2,3}(?:\.\d+)?%|10x|100x)\b/;

const ASSET_MAX_LENGTH: Record<AssetType, number> = {
  X_THREAD: 280,
  CHANGELOG: 1200,
  RELEASE_NOTE: 1400,
  SALES_SNIPPET: 800,
  LINKEDIN: 1300,
  EMAIL: 2200,
  SUPPORT_FAQ: 2500,
  INTERNAL_BRIEF: 3000,
  PRODUCT_BLOG: 5000,
};

export interface LinterContext {
  content: string;
  asset_type?: AssetType;
  citations?: string[];
  brand_profile: BrandProfile;
  evidence_pack?: EvidencePack;
  sensitivity?: SensitivityFindings;
  is_breaking_change?: boolean;
  has_pricing_approval?: boolean;
  has_compliance_approval?: boolean;
  existing_overrides?: Map<LintCode, { is_overridden: boolean; override_reason?: string }>;
}

export class SafetyLinterEngine {
  static runAll14Linters(ctx: LinterContext): LintFinding[] {
    const {
      content,
      asset_type = "CHANGELOG",
      citations = [],
      brand_profile,
      evidence_pack,
      sensitivity,
      is_breaking_change = false,
      has_pricing_approval = false,
      has_compliance_approval = false,
      existing_overrides,
    } = ctx;

    const findings: LintFinding[] = [];
    const text = content || "";
    const lower = text.toLowerCase();
    const isExternalAsset = asset_type !== "INTERNAL_BRIEF";

    const pushFinding = (
      rule_code: LintCode,
      severity: "BLOCKER" | "WARNING",
      message: string,
      snippet?: string
    ) => {
      const prev = existing_overrides?.get(rule_code);
      findings.push({
        id: crypto.randomUUID(),
        rule_code,
        severity,
        message,
        snippet,
        is_overridden: severity === "WARNING" && Boolean(prev?.is_overridden),
        override_reason:
          severity === "WARNING" && prev?.is_overridden
            ? prev.override_reason
            : undefined,
      });
    };

    // 1. LINT-CODENAME
    const matchedCodename = brand_profile.codenames.find((cn) =>
      lower.includes(cn.toLowerCase())
    );
    if (matchedCodename && isExternalAsset) {
      pushFinding(
        "LINT-CODENAME",
        "BLOCKER",
        `Internal project codename "${matchedCodename}" cannot appear in external copy.`,
        matchedCodename
      );
    }

    // 2. LINT-UNCITED
    const evidenceCombined = evidence_pack
      ? evidence_pack.chunks.map((c) => c.content).join("\n").toLowerCase()
      : "";
    const metricMatch = text.match(UNGROUNDED_METRIC_PATTERN);
    if (isExternalAsset && text.trim().length > 0) {
      if (citations.length === 0) {
        pushFinding(
          "LINT-UNCITED",
          "BLOCKER",
          "External copy must link at least one verified EvidencePack chunk citation.",
          text.slice(0, 80)
        );
      } else if (
        metricMatch &&
        evidenceCombined &&
        !evidenceCombined.includes(metricMatch[1].toLowerCase())
      ) {
        pushFinding(
          "LINT-UNCITED",
          "BLOCKER",
          `Numeric claim "${metricMatch[1]}" is not grounded in the EvidencePack.`,
          metricMatch[1]
        );
      }
    }

    // 3. LINT-TOKEN
    const scrubbed = SecretScrubber.scrubText(text);
    if (scrubbed !== text && scrubbed.includes(REDACTION_MARKER)) {
      pushFinding(
        "LINT-TOKEN",
        "BLOCKER",
        "Detected credential, API token, JWT, or private key inside draft copy.",
        REDACTION_MARKER
      );
    }

    // 4. LINT-COMPETITOR
    const matchedCompetitor = brand_profile.competitors.find((comp) =>
      lower.includes(comp.toLowerCase())
    );
    if (matchedCompetitor) {
      pushFinding(
        "LINT-COMPETITOR",
        "WARNING",
        `Competitor reference "${matchedCompetitor}" requires PMM verification.`,
        matchedCompetitor
      );
    }

    // 5. LINT-SUPERLATIVE
    const supMatch = text.match(SUPERLATIVE_PATTERN);
    if (supMatch) {
      pushFinding(
        "LINT-SUPERLATIVE",
        "WARNING",
        `Unsubstantiated superlative "${supMatch[0]}" weakens technical credibility.`,
        supMatch[0]
      );
    }

    // 6. LINT-PRICING
    const priceMatch = text.match(PRICING_PATTERN);
    if (priceMatch && !has_pricing_approval && isExternalAsset) {
      pushFinding(
        "LINT-PRICING",
        "BLOCKER",
        `Pricing claim "${priceMatch[0]}" requires GTM VP sign-off (P-PRICING).`,
        priceMatch[0]
      );
    }

    // 7. LINT-TIMING
    const timingMatch = text.match(TIMING_PATTERN);
    if (timingMatch) {
      pushFinding(
        "LINT-TIMING",
        "WARNING",
        `Hard delivery commitment "${timingMatch[0]}" creates customer SLA risk.`,
        timingMatch[0]
      );
    }

    // 8. LINT-EMBARGO
    if (sensitivity?.is_embargoed && isExternalAsset) {
      pushFinding(
        "LINT-EMBARGO",
        "BLOCKER",
        "Change is under active marketing embargo (P-EMBARGO); external publication blocked.",
        sensitivity.embargo_date
          ? sensitivity.embargo_date.toISOString().slice(0, 10)
          : "EMBARGO"
      );
    }

    // 9. LINT-LENGTH
    const maxLen = ASSET_MAX_LENGTH[asset_type] || 1500;
    if (text.length > maxLen) {
      pushFinding(
        "LINT-LENGTH",
        "WARNING",
        `${asset_type} exceeds ${maxLen}-character budget (${text.length} chars).`,
        `${text.length}/${maxLen} chars`
      );
    }

    // 10. LINT-PROFANITY
    const profMatch = text.match(PROFANITY_PATTERN);
    if (profMatch) {
      pushFinding(
        "LINT-PROFANITY",
        "BLOCKER",
        `Unprofessional or profane term "${profMatch[0]}" detected.`,
        profMatch[0]
      );
    }

    // 11. LINT-SECURITY
    const secMatch = text.match(SECURITY_DISCLOSURE_PATTERN);
    if (secMatch && isExternalAsset) {
      pushFinding(
        "LINT-SECURITY",
        "BLOCKER",
        `Raw security/exploit detail "${secMatch[0]}" cannot be published directly without Security Lead advisory.`,
        secMatch[0]
      );
    }

    // 12. LINT-FORMAT
    if (!text.trim() || /\b(TODO|TBD|\[INSERT)\b/i.test(text)) {
      pushFinding(
        "LINT-FORMAT",
        "WARNING",
        "Draft contains empty body or unfinished placeholder markers (TODO/TBD/[INSERT).",
        text.trim() ? "Placeholder marker" : "Empty draft"
      );
    }

    // 13. LINT-PERSONA
    if (
      is_breaking_change &&
      isExternalAsset &&
      !/\b(migrat|upgrade|deprecat|breaking)\b/i.test(text)
    ) {
      pushFinding(
        "LINT-PERSONA",
        "WARNING",
        "Breaking API change draft lacks developer migration or upgrade guidance.",
        "Missing migration note"
      );
    }

    // 14. LINT-DISALLOWED-CLAIM
    const matchedClaim = brand_profile.disallowed_claims.find((claim) =>
      lower.includes(claim.toLowerCase())
    );
    if (matchedClaim) {
      pushFinding(
        "LINT-DISALLOWED-CLAIM",
        "BLOCKER",
        `Blacklisted claim "${matchedClaim}" violates brand safety guardrails.`,
        matchedClaim
      );
    } else if (
      /\b(SOC\s*2 certified|HIPAA compliant|GDPR compliant)\b/i.test(text) &&
      !has_compliance_approval &&
      isExternalAsset
    ) {
      pushFinding(
        "LINT-DISALLOWED-CLAIM",
        "BLOCKER",
        "Compliance certification claim requires Compliance Officer sign-off (P-COMPL).",
        "Compliance certification"
      );
    }

    return findings;
  }

  static hasUnresolvedBlockersOrWarnings(findings: LintFinding[]): boolean {
    return findings.some(
      (f) => f.severity === "BLOCKER" || (f.severity === "WARNING" && !f.is_overridden)
    );
  }
}
