import crypto from "node:crypto";
import { settings } from "../config.js";
import { persistStore, store } from "../store.js";
import {
  ChangeEvent,
  ChangeMembership,
  ConfidenceBand,
  DecisionRun,
  EvidenceChunk,
  EvidencePack,
  JudgmentConsensus,
  LaunchCandidate,
  LaunchTier,
  PolicyEffect,
  PolicyRuleDef,
  QuestionAnswer,
  SourceEvent,
} from "../types.js";

export interface ChangeFacts {
  changed_files_count: number;
  ci_test_status: string;
  has_customer_docs: boolean;
  author_attribution: string;
  is_breaking_change: boolean;
  is_infra_only: boolean;
  is_revert: boolean;
  availability: string;
  ticket_priority: string;
  issue_type: string;
  total_commits_count: number;
  raw_metrics: Record<string, unknown>;
}

export interface SensitivityFindings {
  security_flags: boolean;
  customer_nda_detected: boolean;
  compliance_flag: boolean;
  pricing_impact: boolean;
  is_embargoed: boolean;
  embargo_date: Date | null;
  matched_patterns: Record<string, string[]>;
  summary_findings: string[];
}

export class DeterministicFactExtractor {
  private static readonly DOCS_PATTERN =
    /(docs\/|doc\/|documentation\/|\.md$|CHANGELOG|README|RELEASE_NOTES)/i;

  private static readonly INFRA_ONLY_PATTERN =
    /^(\.github\/|\.gitlab\/|k8s\/|deploy\/|docker\/|Dockerfile|docker-compose|\.env|\.circleci\/)/i;

  private static readonly CONVENTIONAL_INFRA_PREFIXES = [
    "chore:",
    "ci:",
    "build:",
    "test:",
    "tests:",
    "infra:",
  ];

  private static readonly CONVENTIONAL_BREAKING_PREFIXES = [
    "breaking:",
    "feat!:",
    "fix!:",
    "refactor!:",
  ];

  static extractFacts(
    changeEvent: ChangeEvent,
    sourceEvents: SourceEvent[]
  ): ChangeFacts {
    const facts: ChangeFacts = {
      changed_files_count: 0,
      ci_test_status: "unknown",
      has_customer_docs: false,
      author_attribution: "unknown",
      is_breaking_change: false,
      is_infra_only: false,
      is_revert: false,
      availability: changeEvent.availability || "unknown",
      ticket_priority: "medium",
      issue_type: "unknown",
      total_commits_count: 0,
      raw_metrics: {},
    };

    const allFilesChanged = new Set<string>();
    const breakingIndicators: string[] = [];
    let isRevertDetected = false;
    const authors = new Set<string>();
    const ciStatuses: string[] = [];
    let commitCount = 0;
    let jiraPriority = "medium";
    let jiraIssueType = "unknown";

    const combinedText = `${changeEvent.title || ""}\n${changeEvent.description || ""}`;
    if (this.containsBreakingChangeText(combinedText)) {
      facts.is_breaking_change = true;
      breakingIndicators.push(
        "Title/Description contains breaking change pattern"
      );
    }

    if (this.containsRevertText(changeEvent.title || "")) {
      isRevertDetected = true;
    }

    for (const event of sourceEvents) {
      const payload = (event.raw_payload || {}) as Record<string, any>;
      if (event.source_type === "GITHUB") {
        this.extractGithubFacts({
          payload,
          allFiles: allFilesChanged,
          authors,
          ciStatuses,
          breakingIndicators,
          facts,
        });
        if (Array.isArray(payload.commits)) {
          commitCount += payload.commits.length;
        } else if (typeof payload.pull_request?.commits === "number") {
          commitCount += payload.pull_request.commits;
        }
      } else if (event.source_type === "JIRA") {
        const fields = payload.issue?.fields || {};
        if (fields && typeof fields === "object") {
          if (fields.priority && typeof fields.priority === "object") {
            jiraPriority = String(fields.priority.name || "medium").toLowerCase();
          }
          if (fields.issuetype && typeof fields.issuetype === "object") {
            jiraIssueType = String(fields.issuetype.name || "unknown").toLowerCase();
          }
          if (fields.assignee && typeof fields.assignee === "object") {
            const assigneeName =
              fields.assignee.displayName || fields.assignee.name;
            if (assigneeName) authors.add(String(assigneeName));
          }
          const summary = String(fields.summary || "");
          const description = String(fields.description || "");
          if (this.containsBreakingChangeText(`${summary}\n${description}`)) {
            facts.is_breaking_change = true;
            breakingIndicators.push(
              "Jira summary/description indicates breaking change"
            );
          }
          if (this.containsRevertText(summary)) {
            isRevertDetected = true;
          }
        }
      } else if (event.source_type === "SLACK") {
        const user = payload.event?.user;
        if (user) {
          authors.add(`slack:${user}`);
        }
      }
    }

    facts.changed_files_count = allFilesChanged.size;
    facts.total_commits_count = commitCount;
    facts.ticket_priority = jiraPriority;
    facts.issue_type = jiraIssueType;
    facts.is_revert = facts.is_revert || isRevertDetected;

    const filesArr = Array.from(allFilesChanged);
    facts.has_customer_docs = filesArr.some((f) => this.DOCS_PATTERN.test(f));

    if (
      filesArr.length > 0 &&
      filesArr.every((f) => this.INFRA_ONLY_PATTERN.test(f))
    ) {
      facts.is_infra_only = true;
    } else if (
      filesArr.length === 0 &&
      this.CONVENTIONAL_INFRA_PREFIXES.some((prefix) =>
        (changeEvent.title || "").toLowerCase().startsWith(prefix)
      )
    ) {
      facts.is_infra_only = true;
    }

    if (breakingIndicators.length > 0) {
      facts.is_breaking_change = true;
    }

    if (ciStatuses.includes("failed")) {
      facts.ci_test_status = "failed";
    } else if (
      ciStatuses.includes("passed") ||
      ciStatuses.includes("success")
    ) {
      facts.ci_test_status = "passed";
    } else if (ciStatuses.includes("pending")) {
      facts.ci_test_status = "pending";
    } else {
      facts.ci_test_status = "unknown";
    }

    facts.author_attribution =
      authors.size > 0 ? Array.from(authors).sort().join(", ") : "system";

    facts.raw_metrics = {
      all_files_count: allFilesChanged.size,
      breaking_indicators: breakingIndicators,
      authors_count: authors.size,
    };

    return facts;
  }

  private static extractGithubFacts(params: {
    payload: Record<string, any>;
    allFiles: Set<string>;
    authors: Set<string>;
    ciStatuses: string[];
    breakingIndicators: string[];
    facts: ChangeFacts;
  }): void {
    const {
      payload,
      allFiles,
      authors,
      ciStatuses,
      breakingIndicators,
      facts,
    } = params;

    const pr = payload.pull_request;
    if (pr && typeof pr === "object") {
      const title = String(pr.title || "");
      const body = String(pr.body || "");
      const user = pr.user?.login;
      if (user) authors.add(String(user));

      if (this.containsBreakingChangeText(`${title}\n${body}`)) {
        breakingIndicators.push(
          "PR title or description contains breaking change"
        );
      }
      if (this.containsRevertText(title)) {
        facts.is_revert = true;
      }
      if (Array.isArray(pr.changed_files)) {
        for (const f of pr.changed_files) {
          const filename = typeof f === "string" ? f : f?.filename || "";
          if (filename) allFiles.add(filename);
        }
      }
    }

    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    for (const c of commits) {
      if (!c || typeof c !== "object") continue;
      const msg = String(c.message || "");
      let author: string | undefined;
      if (c.author && typeof c.author === "object") {
        author = c.author.name || c.author.username || c.author.login;
      } else if (typeof c.author === "string") {
        author = c.author;
      }
      if (author) authors.add(author);

      if (this.containsBreakingChangeText(msg)) {
        breakingIndicators.push(
          `Commit ${String(c.id || "").slice(0, 7)} message contains breaking change`
        );
      }
      if (this.containsRevertText(msg)) {
        facts.is_revert = true;
      }

      const fileLists = [
        ...(Array.isArray(c.added) ? c.added : []),
        ...(Array.isArray(c.modified) ? c.modified : []),
        ...(Array.isArray(c.removed) ? c.removed : []),
      ];
      for (const f of fileLists) {
        if (typeof f === "string" && f) allFiles.add(f);
      }
    }

    if (payload.check_run?.conclusion) {
      ciStatuses.push(String(payload.check_run.conclusion).toLowerCase());
    }
  }

  private static containsBreakingChangeText(text: string): boolean {
    const lower = text.toLowerCase();
    if (lower.includes("breaking change") || lower.includes("breaking_change")) {
      return true;
    }
    if (this.CONVENTIONAL_BREAKING_PREFIXES.some((p) => lower.startsWith(p))) {
      return true;
    }
    if (
      lower.includes("deprecat") ||
      lower.includes("removed endpoint") ||
      lower.includes("backward-incompatible")
    ) {
      return true;
    }
    return false;
  }

  private static containsRevertText(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return (
      lower.startsWith("revert") ||
      lower.includes("rollback") ||
      lower.includes("reverted in #")
    );
  }
}

export class SensitivityDetector {
  private static readonly CVE_PATTERN = /\b(CVE-\d{4}-\d{4,7})\b/gi;
  private static readonly SECURITY_KEYWORDS =
    /\b(vulnerability|auth(?:entication)? bypass|remote code execution|RCE|SQL injection|SQLi|cross-site scripting|XSS|zero-day|exploit|buffer overflow|privilege escalation|security advisory|patch vulnerability)\b/gi;
  private static readonly CUSTOMER_NDA_PATTERNS =
    /(\[CONFIDENTIAL\]|\bNDA\b|Customer:\s*[A-Z0-9_\-\.]+|acme-corp|enterprise customer|confidential customer|custom SLA|client-specific endpoint)/gi;
  private static readonly COMPLIANCE_PATTERNS =
    /\b(SOC\s*2|HIPAA|GDPR|PCI-?DSS|ISO\s*27001|FedRAMP|compliance audit|regulatory requirement|audit log retention)\b/gi;
  private static readonly PRICING_PATTERNS =
    /\b(pricing plan|billing tier|subscription price|paywall|monetization|seat license|credit quota|usage limit cost|stripe checkout|price increase|discount tier)\b/gi;
  private static readonly EMBARGO_PATTERNS =
    /\b(EMBARGO(?:ED)?|embargo until|confidential until|hold publication until)\b/gi;
  private static readonly DATE_PATTERN = /\b(20\d{2}-\d{2}-\d{2})\b/g;

  static scanText(text: string): SensitivityFindings {
    const findings: SensitivityFindings = {
      security_flags: false,
      customer_nda_detected: false,
      compliance_flag: false,
      pricing_impact: false,
      is_embargoed: false,
      embargo_date: null,
      matched_patterns: {},
      summary_findings: [],
    };

    if (!text) return findings;

    const cveMatches = text.match(this.CVE_PATTERN) || [];
    const secMatches = text.match(this.SECURITY_KEYWORDS) || [];
    if (cveMatches.length > 0 || secMatches.length > 0) {
      findings.security_flags = true;
      const secAll = Array.from(new Set([...cveMatches, ...secMatches]));
      findings.matched_patterns.SECURITY = secAll;
      findings.summary_findings.push(
        `Security sensitivity detected: ${secAll.slice(0, 5).join(", ")}`
      );
    }

    const ndaMatches = text.match(this.CUSTOMER_NDA_PATTERNS) || [];
    if (ndaMatches.length > 0) {
      findings.customer_nda_detected = true;
      const ndaUnique = Array.from(new Set(ndaMatches));
      findings.matched_patterns.CUSTOMER_NDA = ndaUnique;
      findings.summary_findings.push(
        `Customer NDA / confidentiality pattern detected: ${ndaUnique.slice(0, 3).join(", ")}`
      );
    }

    const compMatches = text.match(this.COMPLIANCE_PATTERNS) || [];
    if (compMatches.length > 0) {
      findings.compliance_flag = true;
      const compUnique = Array.from(new Set(compMatches));
      findings.matched_patterns.COMPLIANCE = compUnique;
      findings.summary_findings.push(
        `Regulatory compliance standard referenced: ${compUnique.slice(0, 3).join(", ")}`
      );
    }

    const priceMatches = text.match(this.PRICING_PATTERNS) || [];
    if (priceMatches.length > 0) {
      findings.pricing_impact = true;
      const priceUnique = Array.from(new Set(priceMatches));
      findings.matched_patterns.PRICING = priceUnique;
      findings.summary_findings.push(
        `Pricing or monetization modification referenced: ${priceUnique.slice(0, 3).join(", ")}`
      );
    }

    const embargoMatches = text.match(this.EMBARGO_PATTERNS) || [];
    if (embargoMatches.length > 0) {
      findings.is_embargoed = true;
      const dateMatches = text.match(this.DATE_PATTERN) || [];
      if (dateMatches.length > 0) {
        const parsed = new Date(`${dateMatches[0]}T00:00:00.000Z`);
        if (!Number.isNaN(parsed.getTime())) {
          findings.embargo_date = parsed;
        }
      }
      findings.matched_patterns.EMBARGO = embargoMatches;
      findings.summary_findings.push(
        `Marketing embargo detected (Hold date: ${
          findings.embargo_date
            ? findings.embargo_date.toISOString().slice(0, 10)
            : "Unspecified"
        })`
      );
    }

    return findings;
  }

  static scanChangeContext(params: {
    title: string;
    description?: string | null;
    source_texts?: string[];
  }): SensitivityFindings {
    const parts = [params.title];
    if (params.description) parts.push(params.description);
    if (params.source_texts && params.source_texts.length > 0) {
      parts.push(...params.source_texts);
    }
    return this.scanText(parts.join("\n\n"));
  }
}

export class EvidencePackAssembler {
  static readonly MAX_TOKENS = 12000;

  static estimateTokenCount(text: string): number {
    if (!text) return 1;
    return Math.max(1, Math.floor(text.length / 4) + 1);
  }

  static assemblePack(params: {
    change_event: ChangeEvent;
    facts: ChangeFacts;
    sensitivity: SensitivityFindings;
    source_events: SourceEvent[];
    memberships?: ChangeMembership[];
  }): EvidencePack {
    const { change_event, facts, sensitivity, source_events } = params;

    const allChunkTexts: string[] = [];
    const pack: EvidencePack = {
      workspace_id: change_event.workspace_id,
      change_event_id: change_event.id,
      chunks: [],
      total_tokens: 0,
      context_hash: "",
    };

    const pyBool = (v: boolean) => (v ? "True" : "False");
    let factContent =
      `=== DETERMINISTIC FACT SHEET ===\n` +
      `Anchor Reference: ${change_event.anchor_ref}\n` +
      `Title: ${change_event.title}\n` +
      `Lifecycle State: ${change_event.state} | Availability: ${facts.availability}\n` +
      `Changed Files Count: ${facts.changed_files_count} | Commits Count: ${facts.total_commits_count}\n` +
      `Customer Docs Present: ${pyBool(facts.has_customer_docs)}\n` +
      `Breaking Change: ${pyBool(facts.is_breaking_change)}\n` +
      `Infrastructure Only: ${pyBool(facts.is_infra_only)}\n` +
      `Revert Detected: ${pyBool(facts.is_revert)}\n` +
      `Authors: ${facts.author_attribution}\n` +
      `CI Status: ${facts.ci_test_status}\n` +
      `Ticket Priority: ${facts.ticket_priority}\n` +
      `\n=== SENSITIVITY SCAN RESULTS ===\n` +
      `Security Flags: ${pyBool(sensitivity.security_flags)}\n` +
      `Customer NDA Detected: ${pyBool(sensitivity.customer_nda_detected)}\n` +
      `Compliance Flag: ${pyBool(sensitivity.compliance_flag)}\n` +
      `Pricing Impact: ${pyBool(sensitivity.pricing_impact)}\n` +
      `Is Embargoed: ${pyBool(sensitivity.is_embargoed)}\n`;

    if (sensitivity.summary_findings.length > 0) {
      factContent += `Findings: ${sensitivity.summary_findings.join("; ")}\n`;
    }

    this.addBoundedChunk(
      pack,
      "chk_facts_001",
      change_event.anchor_ref,
      "INTERNAL",
      factContent,
      allChunkTexts
    );

    if (change_event.description) {
      this.addBoundedChunk(
        pack,
        "chk_anchor_002",
        change_event.anchor_ref,
        "INTERNAL",
        `=== PRIMARY ANCHOR CONTEXT ===\n${change_event.description}`,
        allChunkTexts
      );
    }

    source_events.forEach((event, i) => {
      const idx = i + 3;
      const payload = (event.raw_payload || {}) as Record<string, any>;
      const sourceRef = event.external_id;
      const trustLabel = event.trust_label || "INTERNAL";

      const lines = [`=== SOURCE EVENT (${event.source_type} - ${sourceRef}) ===`];

      if (event.source_type === "GITHUB") {
        const pr = payload.pull_request;
        if (pr) {
          lines.push(`PR #${pr.number}: ${pr.title}`);
          lines.push(`State: ${pr.state} | Merged: ${pr.merged}`);
          if (pr.body) lines.push(`Description:\n${pr.body}`);
        } else if (Array.isArray(payload.commits)) {
          lines.push(`Push commits count: ${payload.commits.length}`);
          for (const c of payload.commits.slice(0, 5)) {
            lines.push(
              `- ${String(c.id || "").slice(0, 7)}: ${String(c.message || "").trim()}`
            );
          }
        }
      } else if (event.source_type === "JIRA") {
        const issue = payload.issue || {};
        const fields = issue.fields || {};
        lines.push(`Key: ${issue.key} | Summary: ${fields.summary}`);
        lines.push(`Status: ${fields.status?.name}`);
        lines.push(`Issue Type: ${fields.issuetype?.name}`);
        if (fields.description) {
          lines.push(`Description:\n${fields.description}`);
        }
      } else if (event.source_type === "SLACK") {
        const slackEv = payload.event || {};
        lines.push(`Channel: ${slackEv.channel}`);
        lines.push(`Message Text:\n${slackEv.text}`);
      }

      const chunkId = `chk_source_${String(idx).padStart(3, "0")}`;
      this.addBoundedChunk(
        pack,
        chunkId,
        sourceRef,
        trustLabel,
        lines.join("\n"),
        allChunkTexts
      );
    });

    const combinedContext = allChunkTexts.join("\n---\n");
    pack.context_hash = crypto
      .createHash("sha256")
      .update(combinedContext, "utf8")
      .digest("hex");

    return pack;
  }

  private static addBoundedChunk(
    pack: EvidencePack,
    chunkId: string,
    sourceRef: string,
    trustLabel: string,
    content: string,
    allTexts: string[]
  ): boolean {
    let body = content;
    let tokens = this.estimateTokenCount(body);
    const remaining = this.MAX_TOKENS - pack.total_tokens;

    if (remaining <= 10) return false;

    if (tokens > remaining) {
      const suffix = "\n... [TRUNCATED DUE TO 12,000 TOKEN BOUNDING CEILING]";
      const suffixTokens = this.estimateTokenCount(suffix);
      const budgetForBody = Math.max(10, remaining - suffixTokens - 5);
      body = body.slice(0, budgetForBody * 4) + suffix;
      tokens = Math.min(remaining, this.estimateTokenCount(body));
    }

    if (pack.total_tokens + tokens > this.MAX_TOKENS) {
      return false;
    }

    const chunk: EvidenceChunk = {
      chunk_id: chunkId,
      source_ref: sourceRef,
      trust_label: trustLabel,
      content: body,
      token_count: tokens,
    };

    pack.chunks.push(chunk);
    pack.total_tokens += tokens;
    allTexts.push(body);
    return true;
  }
}

export const QUESTIONS_SCHEMA = [
  {
    id: "Q1",
    text: "What is the primary nature of this change from a user / developer perspective?",
    options: [
      "USER_FACING_FEATURE",
      "DEVELOPER_API",
      "INTERNAL_INFRASTRUCTURE",
      "BUG_FIX",
    ],
  },
  {
    id: "Q2",
    text: "Does this introduce a new capability, enhance an existing feature, or remediate a defect?",
    options: [
      "NEW_CAPABILITY",
      "ENHANCEMENT",
      "DEFECT_REMEDIATION",
      "MAINTENANCE",
    ],
  },
  {
    id: "Q3",
    text: "Are there breaking changes, API deprecations, or required migration steps?",
    options: [
      "BREAKING_MIGRATION_REQUIRED",
      "DEPRECATION_WARNING",
      "BACKWARD_COMPATIBLE",
      "NONE",
    ],
  },
  {
    id: "Q4",
    text: "Which primary audience segment does this change target?",
    options: [
      "ENTERPRISE_ADMINS",
      "DEVELOPERS_DEVOPS",
      "END_CONSUMERS",
      "INTERNAL_ENGINEERS",
    ],
  },
  {
    id: "Q5",
    text: "What is the strategic marketing novelty and revenue/differentiation impact?",
    options: [
      "STRATEGIC_FLAGSHIP",
      "NOTABLE_VALUE_ADD",
      "INCREMENTAL_POLISH",
      "ZERO_GTM_VALUE",
    ],
  },
  {
    id: "Q6",
    text: "Does this change touch security vulnerabilities, compliance controls, or sensitive data?",
    options: [
      "CRITICAL_SECURITY_CVE",
      "COMPLIANCE_CONTROL",
      "SECURITY_HARDENING",
      "STANDARD_CODE",
    ],
  },
  {
    id: "Q7",
    text: "What is the product availability stage?",
    options: [
      "GA_GENERAL_AVAILABILITY",
      "PUBLIC_BETA",
      "PRIVATE_PREVIEW",
      "INTERNAL_ONLY",
    ],
  },
  {
    id: "Q8",
    text: "What level of go-to-market enablement is recommended?",
    options: [
      "FULL_LAUNCH_CAMPAIGN",
      "TARGETED_ANNOUNCEMENT",
      "CHANGELOG_ENTRY_ONLY",
      "NO_EXTERNAL_MESSAGING",
    ],
  },
  {
    id: "Q9",
    text: "What is the recommended launch tier?",
    options: ["T1", "T2", "T3", "T0"],
  },
];

export class DeterministicJudgmentClient {
  /**
   * Evaluates Q1-Q9 across 3 distinct analytical lenses:
   * - Sample 0 (temp 0.0): Engineering & Spec Rigor Lens
   * - Sample 1 (temp 0.3): Customer & GTM Value Lens
   * - Sample 2 (temp 0.7): Risk, Documentation & Governance Lens
   */
  evaluateSample(
    pack: EvidencePack,
    facts: ChangeFacts,
    sampleIndex = 0,
    _temperature = 0.0
  ): Record<string, QuestionAnswer> {
    const primaryCitation =
      pack.chunks.length > 0 ? [pack.chunks[0].chunk_id] : ["chk_facts_001"];
    const answers: Record<string, QuestionAnswer> = {};

    // Q1
    let q1Ans: string;
    let q1Rat: string;
    const breakingIndicators = Array.isArray(facts.raw_metrics.breaking_indicators)
      ? facts.raw_metrics.breaking_indicators
      : [];
    if (facts.is_infra_only) {
      q1Ans = "INTERNAL_INFRASTRUCTURE";
      q1Rat =
        "All modified files or title prefixes map to CI/CD, build, or internal infrastructure.";
    } else if (facts.is_breaking_change) {
      q1Ans = "DEVELOPER_API";
      q1Rat = "Contains breaking API changes or deprecation notices.";
    } else if (
      facts.issue_type === "bug" ||
      breakingIndicators.includes("fix")
    ) {
      q1Ans = "BUG_FIX";
      q1Rat = "Classified as defect remediation or bugfix ticket.";
    } else {
      q1Ans = "USER_FACING_FEATURE";
      q1Rat =
        "Contains product feature implementation and user-visible capabilities.";
    }
    answers.Q1 = {
      question_id: "Q1",
      question_text: QUESTIONS_SCHEMA[0].text,
      answer: q1Ans,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: q1Rat,
    };

    // Q2
    let q2Ans: string;
    if (facts.is_infra_only) {
      q2Ans = "MAINTENANCE";
    } else if (facts.issue_type === "bug") {
      q2Ans = "DEFECT_REMEDIATION";
    } else if (
      facts.issue_type === "epic" ||
      facts.issue_type === "story" ||
      facts.changed_files_count > 5
    ) {
      q2Ans = "NEW_CAPABILITY";
    } else {
      q2Ans = "ENHANCEMENT";
    }
    answers.Q2 = {
      question_id: "Q2",
      question_text: QUESTIONS_SCHEMA[1].text,
      answer: q2Ans,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: `Assessed capability from issue type '${facts.issue_type}' and file impact (${facts.changed_files_count} files).`,
    };

    // Q3
    answers.Q3 = {
      question_id: "Q3",
      question_text: QUESTIONS_SCHEMA[2].text,
      answer: facts.is_breaking_change
        ? "BREAKING_MIGRATION_REQUIRED"
        : "BACKWARD_COMPATIBLE",
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: facts.is_breaking_change
        ? "Explicit breaking change or deprecation syntax identified in evidence."
        : "No breaking change indicators or backward-incompatible markers detected.",
    };

    // Q4
    let q4Ans: string;
    if (facts.is_infra_only) {
      q4Ans = "INTERNAL_ENGINEERS";
    } else if (
      facts.is_breaking_change ||
      JSON.stringify(facts.raw_metrics).includes("api")
    ) {
      q4Ans = "DEVELOPERS_DEVOPS";
    } else if (
      facts.ticket_priority === "highest" ||
      facts.ticket_priority === "high" ||
      facts.issue_type === "epic"
    ) {
      q4Ans = "ENTERPRISE_ADMINS";
    } else {
      q4Ans = "END_CONSUMERS";
    }
    answers.Q4 = {
      question_id: "Q4",
      question_text: QUESTIONS_SCHEMA[3].text,
      answer: q4Ans,
      confidence:
        sampleIndex === 0 ? ConfidenceBand.HIGH : ConfidenceBand.MEDIUM,
      citations: primaryCitation,
      rationale: `Target segment derived from change scope and ticket priority '${facts.ticket_priority}'.`,
    };

    // Q5
    let q5Ans: string;
    if (facts.is_infra_only) {
      q5Ans = "ZERO_GTM_VALUE";
    } else if (
      facts.issue_type === "epic" ||
      facts.ticket_priority === "highest"
    ) {
      q5Ans = "STRATEGIC_FLAGSHIP";
    } else if (
      facts.changed_files_count >= 8 ||
      facts.is_breaking_change ||
      (facts.issue_type === "story" && facts.has_customer_docs)
    ) {
      q5Ans = "NOTABLE_VALUE_ADD";
    } else {
      q5Ans = "INCREMENTAL_POLISH";
    }
    answers.Q5 = {
      question_id: "Q5",
      question_text: QUESTIONS_SCHEMA[4].text,
      answer: q5Ans,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: `Evaluated novelty against scale (${facts.changed_files_count} files, priority: ${facts.ticket_priority}).`,
    };

    // Q6
    const firstChunkContent = pack.chunks[0]?.content || "";
    const hasSec = firstChunkContent.includes("Security Flags: True");
    const hasComp = firstChunkContent.includes("Compliance Flag: True");
    answers.Q6 = {
      question_id: "Q6",
      question_text: QUESTIONS_SCHEMA[5].text,
      answer: hasSec
        ? "CRITICAL_SECURITY_CVE"
        : hasComp
          ? "COMPLIANCE_CONTROL"
          : "STANDARD_CODE",
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: hasSec
        ? "Security/CVE sensitivity scan triggered on change text."
        : hasComp
          ? "Regulatory compliance keyword detected."
          : "No sensitive security or compliance indicators identified.",
    };

    // Q7
    let q7Ans = "GA_GENERAL_AVAILABILITY";
    if (facts.is_infra_only || facts.availability === "internal") {
      q7Ans = "INTERNAL_ONLY";
    } else if (facts.availability === "beta") {
      q7Ans = "PUBLIC_BETA";
    }
    answers.Q7 = {
      question_id: "Q7",
      question_text: QUESTIONS_SCHEMA[6].text,
      answer: q7Ans,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: `Reflected availability stage '${facts.availability}'.`,
    };

    // Q8
    let q8Ans: string;
    if (facts.is_infra_only || facts.is_revert) {
      q8Ans = "NO_EXTERNAL_MESSAGING";
    } else if (q5Ans === "STRATEGIC_FLAGSHIP") {
      q8Ans = "FULL_LAUNCH_CAMPAIGN";
    } else if (q5Ans === "NOTABLE_VALUE_ADD") {
      q8Ans = "TARGETED_ANNOUNCEMENT";
    } else {
      q8Ans = "CHANGELOG_ENTRY_ONLY";
    }
    answers.Q8 = {
      question_id: "Q8",
      question_text: QUESTIONS_SCHEMA[7].text,
      answer: q8Ans,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: `Derived enablement requirements from strategic novelty (${q5Ans}).`,
    };

    // Q9: Multi-lens evaluation
    let lensTier: LaunchTier;
    let lensRat: string;

    if (facts.is_infra_only || facts.is_revert) {
      lensTier = LaunchTier.T0;
      lensRat =
        "Internal infrastructure, revert, or CI change; zero external GTM (Tier T0).";
    } else if (sampleIndex === 0) {
      // Lens 0: Engineering & Spec Rigor
      if (q5Ans === "STRATEGIC_FLAGSHIP" && facts.has_customer_docs) {
        lensTier = LaunchTier.T1;
        lensRat =
          "Engineering Spec Lens: Strategic flagship with verified customer documentation (Tier T1).";
      } else if (
        q5Ans === "STRATEGIC_FLAGSHIP" ||
        q5Ans === "NOTABLE_VALUE_ADD" ||
        facts.is_breaking_change
      ) {
        lensTier = LaunchTier.T2;
        lensRat =
          "Engineering Spec Lens: Notable product change or breaking API contract (Tier T2).";
      } else {
        lensTier = LaunchTier.T3;
        lensRat =
          "Engineering Spec Lens: Incremental update or bug remediation (Tier T3).";
      }
    } else if (sampleIndex === 1) {
      // Lens 1: Customer & GTM Value
      if (
        (q5Ans === "STRATEGIC_FLAGSHIP" || facts.ticket_priority === "high") &&
        facts.has_customer_docs &&
        facts.availability === "ga"
      ) {
        lensTier = LaunchTier.T1;
        lensRat =
          "Customer GTM Lens: GA high-priority capability backed by customer docs (Tier T1).";
      } else if (
        q5Ans === "NOTABLE_VALUE_ADD" ||
        facts.ticket_priority === "high" ||
        facts.is_breaking_change
      ) {
        lensTier = LaunchTier.T2;
        lensRat =
          "Customer GTM Lens: High-priority or notable feature warranting targeted announcement (Tier T2).";
      } else {
        lensTier = LaunchTier.T3;
        lensRat =
          "Customer GTM Lens: Standard changelog-worthy improvement (Tier T3).";
      }
    } else {
      // Lens 2: Risk, Docs & Compliance Governance
      if (
        q5Ans === "STRATEGIC_FLAGSHIP" &&
        facts.has_customer_docs &&
        !hasSec
      ) {
        lensTier = LaunchTier.T1;
        lensRat =
          "Risk Governance Lens: Documented flagship with clean security posture (Tier T1).";
      } else if (
        facts.is_breaking_change ||
        (q5Ans === "NOTABLE_VALUE_ADD" && facts.has_customer_docs)
      ) {
        lensTier = LaunchTier.T2;
        lensRat =
          "Risk Governance Lens: Documented notable change or breaking migration notice (Tier T2).";
      } else {
        lensTier = LaunchTier.T3;
        lensRat =
          "Risk Governance Lens: Conservative Tier T3 without full doc/flagship proof.";
      }
    }

    answers.Q9 = {
      question_id: "Q9",
      question_text: QUESTIONS_SCHEMA[8].text,
      answer: lensTier,
      confidence: ConfidenceBand.HIGH,
      citations: primaryCitation,
      rationale: lensRat,
    };

    return answers;
  }
}

export class ConsensusEngine {
  static readonly TEMPERATURE_LADDER = [0.0, 0.3, 0.7];
  static readonly LENS_NAMES = [
    "Engineering & Spec Rigor",
    "Customer & GTM Value",
    "Risk, Docs & Governance",
  ];

  static evaluateConsensus(
    client: DeterministicJudgmentClient,
    pack: EvidencePack,
    facts: ChangeFacts,
    kSamples = 3
  ): JudgmentConsensus {
    const samplesResults: Array<Record<string, QuestionAnswer>> = [];
    const rawSamplesList: Array<Record<string, unknown>> = [];

    for (let i = 0; i < kSamples; i++) {
      const temp =
        this.TEMPERATURE_LADDER[i % this.TEMPERATURE_LADDER.length];
      const answers = client.evaluateSample(pack, facts, i, temp);
      samplesResults.push(answers);
      rawSamplesList.push({
        sample_index: i,
        lens: this.LENS_NAMES[i % this.LENS_NAMES.length],
        temperature: temp,
        q9_tier: answers.Q9.answer,
        q9_rationale: answers.Q9.rationale,
        answers,
      });
    }

    const counts = new Map<string, number>();
    for (const res of samplesResults) {
      const val = String(res.Q9.answer);
      counts.set(val, (counts.get(val) || 0) + 1);
    }

    let consensusTierVal = LaunchTier.T3 as string;
    let topCount = 0;
    for (const [val, cnt] of counts.entries()) {
      if (cnt > topCount) {
        topCount = cnt;
        consensusTierVal = val;
      }
    }
    const consensusTier = consensusTierVal as LaunchTier;
    const agreementScore = Number((topCount / kSamples).toFixed(2));

    let confidence: ConfidenceBand;
    if (agreementScore >= 0.9) {
      confidence = ConfidenceBand.HIGH;
    } else if (agreementScore >= 0.6) {
      confidence = ConfidenceBand.MEDIUM;
    } else {
      confidence = ConfidenceBand.LOW;
    }

    const baseScores: Record<LaunchTier, number> = {
      [LaunchTier.T1]: 90,
      [LaunchTier.T2]: 70,
      [LaunchTier.T3]: 45,
      [LaunchTier.T0]: 15,
    };
    const base = baseScores[consensusTier] ?? 50;
    let modifier = 0;
    if (facts.has_customer_docs) modifier += 5;
    if (facts.changed_files_count > 10) modifier += 5;
    if (facts.is_breaking_change) modifier += 5;
    if (confidence === ConfidenceBand.LOW) modifier -= 10;

    const finalScore = Math.max(1, Math.min(100, base + modifier));

    const primaryAnswers = samplesResults[0];
    const compiledAnswers: QuestionAnswer[] = Object.entries(primaryAnswers).map(
      ([qId, ans]) => {
        if (qId === "Q9") {
          return {
            ...ans,
            answer: consensusTier,
            confidence,
          };
        }
        return ans;
      }
    );

    return {
      k_samples: kSamples,
      consensus_tier: consensusTier,
      confidence,
      score: finalScore,
      answers: compiledAnswers,
      raw_samples: rawSamplesList,
      agreement_score: agreementScore,
    };
  }
}

export const DEFAULT_POLICY_RULES: PolicyRuleDef[] = [
  {
    code: "P-SEC",
    name: "Security/CVE Remediation Gate",
    description:
      "Changes touching security vulnerabilities must be reviewed by Security Lead.",
    effect: PolicyEffect.REQUIRE_DOMAIN_APPROVER,
    condition: "facts.security_flags == true",
    required_role: "security_lead",
  },
  {
    code: "P-CUST",
    name: "Customer NDA / PII Embargo",
    description:
      "Changes referencing private enterprise customer names must not leak externally.",
    effect: PolicyEffect.ADD_BLOCKING_FINDING,
    condition: "facts.customer_nda_detected == true",
  },
  {
    code: "P-EMBARGO",
    name: "Marketing Embargo Date Gate",
    description:
      "Embargoed product features cannot be published before scheduled date.",
    effect: PolicyEffect.SUPPRESS_LAUNCH,
    condition: "facts.is_embargoed == true and now() < facts.embargo_date",
  },
  {
    code: "P-COMPL",
    name: "Regulatory Compliance Audit",
    description:
      "Changes affecting SOC2, HIPAA, or financial controls require Legal sign-off.",
    effect: PolicyEffect.REQUIRE_DOMAIN_APPROVER,
    condition: "facts.compliance_flag == true",
    required_role: "compliance_officer",
  },
  {
    code: "P-DEPR",
    name: "API Deprecation Escalation",
    description:
      "Breaking API changes or endpoint deprecations must be elevated to at least T2.",
    effect: PolicyEffect.ESCALATE_TIER,
    condition: "facts.is_breaking_change == true",
    target_tier: LaunchTier.T2,
  },
  {
    code: "P-INTERNAL",
    name: "Internal Infrastructure Demotion",
    description:
      "CI/CD, developer tooling, and refactors are restricted to T0.",
    effect: PolicyEffect.ESCALATE_TIER,
    condition: "facts.is_infra_only == true",
    target_tier: LaunchTier.T0,
  },
  {
    code: "P-PRICING",
    name: "Pricing & Monetization Shift",
    description: "Monetization alterations require GTM VP sign-off.",
    effect: PolicyEffect.REQUIRE_DOMAIN_APPROVER,
    condition: "facts.pricing_impact == true",
    required_role: "gtm_vp",
  },
  {
    code: "P-REVERT",
    name: "Revert Invalidation",
    description:
      "Reverted commits automatically suppress pending launch drafts.",
    effect: PolicyEffect.SUPPRESS_LAUNCH,
    condition: "facts.is_revert == true",
  },
  {
    code: "P-EXPERIMENTAL",
    name: "Experimental Flag Restriction",
    description:
      "Features marked experimental require explicit PMM override for external copy.",
    effect: PolicyEffect.ADD_BLOCKING_FINDING,
    condition:
      "facts.availability == 'internal' and target_asset.is_external == true",
  },
  {
    code: "P-MAJOR-TIER",
    name: "T1 Dual Approval Requirement",
    description: "Strategic launches require two independent human approvals.",
    effect: PolicyEffect.REQUIRE_DOMAIN_APPROVER,
    condition: "candidate.tier == 'T1'",
    required_role: "product_lead",
  },
  {
    code: "P-EXTERNAL-TRUST",
    name: "Untrusted External Content Filter",
    description:
      "Source events from untrusted origins cannot be cited in public claims.",
    effect: PolicyEffect.ADD_BLOCKING_FINDING,
    condition: "evidence.has_untrusted_source == true",
  },
];

const TIER_HIERARCHY: Record<LaunchTier, number> = {
  [LaunchTier.T0]: 0,
  [LaunchTier.T3]: 1,
  [LaunchTier.T2]: 2,
  [LaunchTier.T1]: 3,
};

export interface PolicyEvaluationResult {
  escalated_tier: LaunchTier | null;
  required_approvers: string[];
  blocking_findings: string[];
  suppress_launch: boolean;
  suppress_reasons: string[];
  triggered_rules: Array<Record<string, unknown>>;
}

export class PolicyEngine {
  static evaluate(params: {
    facts: ChangeFacts;
    sensitivity: SensitivityFindings;
    proposed_tier: LaunchTier;
    pack?: EvidencePack;
    custom_rules?: PolicyRuleDef[];
  }): PolicyEvaluationResult {
    const { facts, sensitivity, proposed_tier, pack, custom_rules = [] } =
      params;
    const rulesToRun = [...custom_rules, ...DEFAULT_POLICY_RULES];
    const result: PolicyEvaluationResult = {
      escalated_tier: null,
      required_approvers: [],
      blocking_findings: [],
      suppress_launch: false,
      suppress_reasons: [],
      triggered_rules: [],
    };

    const now = new Date();
    let currentTier = proposed_tier;
    const hasUntrusted = pack
      ? pack.chunks.some((c) => c.trust_label === "EXTERNAL_UNTRUSTED")
      : false;

    for (const rule of rulesToRun) {
      let triggered = false;
      let triggerReason = "";

      if (rule.code === "P-SEC" && sensitivity.security_flags) {
        triggered = true;
        triggerReason =
          "Security/CVE sensitivity detected in change context.";
      } else if (rule.code === "P-CUST" && sensitivity.customer_nda_detected) {
        triggered = true;
        triggerReason =
          "Customer NDA / Enterprise confidentiality pattern detected.";
      } else if (rule.code === "P-EMBARGO" && sensitivity.is_embargoed) {
        if (!sensitivity.embargo_date || now < sensitivity.embargo_date) {
          triggered = true;
          triggerReason = `Active embargo in effect (Hold until: ${
            sensitivity.embargo_date
              ? sensitivity.embargo_date.toISOString()
              : "TBD"
          }).`;
        }
      } else if (rule.code === "P-COMPL" && sensitivity.compliance_flag) {
        triggered = true;
        triggerReason =
          "Regulatory compliance keyword (SOC2, HIPAA, GDPR, etc.) detected.";
      } else if (rule.code === "P-DEPR" && facts.is_breaking_change) {
        triggered = true;
        triggerReason =
          "Breaking change or API deprecation detected; escalating to at least T2.";
      } else if (rule.code === "P-INTERNAL" && facts.is_infra_only) {
        triggered = true;
        triggerReason =
          "Internal developer tooling or CI/CD infrastructure change; restricted to T0.";
      } else if (rule.code === "P-PRICING" && sensitivity.pricing_impact) {
        triggered = true;
        triggerReason =
          "Pricing or monetization modification detected; requires GTM VP sign-off.";
      } else if (rule.code === "P-REVERT" && facts.is_revert) {
        triggered = true;
        triggerReason =
          "Change is marked as a code revert/rollback; suppressing GTM publication.";
      } else if (
        rule.code === "P-EXPERIMENTAL" &&
        facts.availability === "internal" &&
        currentTier !== LaunchTier.T0
      ) {
        triggered = true;
        triggerReason =
          "Internal availability feature flagged for external copy restriction.";
      } else if (
        rule.code === "P-MAJOR-TIER" &&
        currentTier === LaunchTier.T1
      ) {
        triggered = true;
        triggerReason =
          "Tier T1 Strategic launch mandates two independent approvers (Lead PMM + Product Lead).";
      } else if (rule.code === "P-EXTERNAL-TRUST" && hasUntrusted) {
        triggered = true;
        triggerReason =
          "Untrusted external source content detected in evidence pack.";
      }

      if (triggered) {
        result.triggered_rules.push({
          rule_code: rule.code,
          rule_name: rule.name,
          effect: rule.effect,
          reason: triggerReason,
        });

        if (rule.effect === PolicyEffect.REQUIRE_DOMAIN_APPROVER) {
          if (
            rule.required_role &&
            !result.required_approvers.includes(rule.required_role)
          ) {
            result.required_approvers.push(rule.required_role);
          }
        } else if (rule.effect === PolicyEffect.ADD_BLOCKING_FINDING) {
          result.blocking_findings.push(`[${rule.code}] ${triggerReason}`);
        } else if (rule.effect === PolicyEffect.SUPPRESS_LAUNCH) {
          result.suppress_launch = true;
          result.suppress_reasons.push(`[${rule.code}] ${triggerReason}`);
        } else if (
          rule.effect === PolicyEffect.ESCALATE_TIER &&
          rule.target_tier
        ) {
          const target = rule.target_tier;
          if (rule.code === "P-INTERNAL") {
            currentTier = LaunchTier.T0;
            result.escalated_tier = LaunchTier.T0;
          } else if (TIER_HIERARCHY[target] > TIER_HIERARCHY[currentTier]) {
            currentTier = target;
            result.escalated_tier = target;
          }
        }
      }
    }

    return result;
  }
}

export interface EvaluatedCandidateDecision {
  tier: LaunchTier;
  confidence: ConfidenceBand;
  score: number;
  is_external_safe: boolean;
  status: string;
  safety_warnings: string[];
  reasons: string[];
  required_approvers: string[];
  policy_hits: Array<Record<string, unknown>>;
}

export class TierEvaluator {
  static evaluateCandidate(params: {
    facts: ChangeFacts;
    sensitivity: SensitivityFindings;
    consensus: JudgmentConsensus;
    policy_result: PolicyEvaluationResult;
  }): EvaluatedCandidateDecision {
    const { facts, sensitivity, consensus, policy_result } = params;

    let candidateTier = consensus.consensus_tier;
    if (policy_result.escalated_tier !== null) {
      candidateTier = policy_result.escalated_tier;
    }
    if (facts.is_infra_only || facts.is_revert) {
      candidateTier = LaunchTier.T0;
    }

    const status =
      policy_result.suppress_launch || facts.is_revert
        ? "SUPPRESSED"
        : "PENDING_REVIEW";

    let isExternalSafe = true;
    if (status === "SUPPRESSED") isExternalSafe = false;
    if (candidateTier === LaunchTier.T0) isExternalSafe = false;
    if (policy_result.blocking_findings.length > 0) isExternalSafe = false;
    if (policy_result.required_approvers.length > 0) isExternalSafe = false;
    if (sensitivity.customer_nda_detected || sensitivity.security_flags) {
      isExternalSafe = false;
    }

    const warnings: string[] = [];
    if (policy_result.suppress_reasons.length > 0) {
      warnings.push(...policy_result.suppress_reasons);
    }
    if (policy_result.blocking_findings.length > 0) {
      warnings.push(...policy_result.blocking_findings);
    }
    if (policy_result.required_approvers.length > 0) {
      warnings.push(
        `Mandatory domain sign-off required by: ${policy_result.required_approvers.join(", ")}`
      );
    }
    if (sensitivity.summary_findings.length > 0) {
      warnings.push(...sensitivity.summary_findings);
    }

    const reasons: string[] = [
      `Consensus evaluation across k=${consensus.k_samples} samples proposed Tier ${consensus.consensus_tier} (Agreement: ${Math.round(consensus.agreement_score * 100)}%).`,
    ];
    if (policy_result.escalated_tier) {
      reasons.push(
        `Policy engine escalated tier to ${policy_result.escalated_tier} based on enterprise rules.`
      );
    }
    if (facts.is_infra_only) {
      reasons.push(
        "Restricted to Tier T0 because change is infrastructure/developer tooling only."
      );
    }
    if (facts.is_revert) {
      reasons.push(
        "Classified as Tier T0 and SUPPRESSED due to revert/rollback indicator."
      );
    }
    if (facts.is_breaking_change) {
      reasons.push(
        "Identified breaking change or API deprecation requiring developer notification."
      );
    }
    if (facts.has_customer_docs) {
      reasons.push("Customer-facing documentation updates present in changeset.");
    }

    return {
      tier: candidateTier,
      confidence: consensus.confidence,
      score: consensus.score,
      is_external_safe: isExternalSafe,
      status,
      safety_warnings: warnings,
      reasons,
      required_approvers: policy_result.required_approvers,
      policy_hits: policy_result.triggered_rules,
    };
  }
}

export function recomputeCandidateExternalSafety(
  candidate: LaunchCandidate
): boolean {
  if (candidate.status === "SUPPRESSED" || candidate.status === "REJECTED") {
    candidate.is_external_safe = false;
    return false;
  }
  const activeTier = candidate.confirmed_tier || candidate.tier;
  if (activeTier === LaunchTier.T0) {
    candidate.is_external_safe = false;
    return false;
  }

  const signedRoles = new Set(candidate.domain_signoffs.map((s) => s.role));
  const allApproversSigned = candidate.required_approvers.every((role) =>
    signedRoles.has(role)
  );
  if (!allApproversSigned) {
    candidate.is_external_safe = false;
    return false;
  }

  const drafts = Array.from(store.gtmDrafts.values()).filter(
    (d) => d.launch_candidate_id === candidate.id
  );
  if (drafts.some((d) => !d.is_external_safe)) {
    candidate.is_external_safe = false;
    return false;
  }

  candidate.is_external_safe = true;
  return true;
}

export function evaluateChangeEvent(
  changeEvent: ChangeEvent
): { candidate: LaunchCandidate; decision_run: DecisionRun } {
  const memberships = store.changeMemberships.filter(
    (m) => m.change_event_id === changeEvent.id && m.is_active
  );

  const sourceEventIds = memberships
    .map((m) => m.source_event_id)
    .filter((id): id is string => Boolean(id));

  const sourceEvents: SourceEvent[] = sourceEventIds
    .map((id) => store.sourceEvents.get(id))
    .filter((se): se is SourceEvent => Boolean(se));

  const facts = DeterministicFactExtractor.extractFacts(
    changeEvent,
    sourceEvents
  );

  const sourceTexts = sourceEvents
    .filter((se) => Boolean(se.raw_payload))
    .map((se) => JSON.stringify(se.raw_payload));

  const sensitivity = SensitivityDetector.scanChangeContext({
    title: changeEvent.title || "",
    description: changeEvent.description,
    source_texts: sourceTexts,
  });

  const evidencePack = EvidencePackAssembler.assemblePack({
    change_event: changeEvent,
    facts,
    sensitivity,
    source_events: sourceEvents,
    memberships,
  });

  const client = new DeterministicJudgmentClient();
  const consensus = ConsensusEngine.evaluateConsensus(
    client,
    evidencePack,
    facts,
    settings.K_SAMPLES
  );

  const policyResult = PolicyEngine.evaluate({
    facts,
    sensitivity,
    proposed_tier: consensus.consensus_tier,
    pack: evidencePack,
  });

  const evaluatedDecision = TierEvaluator.evaluateCandidate({
    facts,
    sensitivity,
    consensus,
    policy_result: policyResult,
  });

  let candidate: LaunchCandidate | undefined;
  for (const existing of store.launchCandidates.values()) {
    if (existing.change_event_id === changeEvent.id) {
      candidate = existing;
      break;
    }
  }

  const now = new Date().toISOString();
  if (!candidate) {
    const candidateId = crypto.randomUUID();
    candidate = {
      id: candidateId,
      workspace_id: changeEvent.workspace_id,
      change_event_id: changeEvent.id,
      tier: evaluatedDecision.tier,
      confirmed_tier: null,
      confidence: evaluatedDecision.confidence,
      score: evaluatedDecision.score,
      reasons: evaluatedDecision.reasons,
      is_external_safe: evaluatedDecision.is_external_safe,
      safety_warnings: evaluatedDecision.safety_warnings,
      required_approvers: evaluatedDecision.required_approvers,
      domain_signoffs: [],
      status: evaluatedDecision.status,
      is_processed: false,
      created_at: now,
    };
    store.launchCandidates.set(candidateId, candidate);
  } else {
    candidate.tier = evaluatedDecision.tier;
    candidate.confidence = evaluatedDecision.confidence;
    candidate.score = evaluatedDecision.score;
    candidate.reasons = evaluatedDecision.reasons;
    candidate.safety_warnings = evaluatedDecision.safety_warnings;
    candidate.required_approvers = evaluatedDecision.required_approvers;
    candidate.status = evaluatedDecision.status;
    candidate.is_processed = false;
    recomputeCandidateExternalSafety(candidate);
  }

  const decisionRun: DecisionRun = {
    id: crypto.randomUUID(),
    launch_candidate_id: candidate.id,
    model_name: settings.MODEL_NAME,
    k_samples: consensus.k_samples,
    evidence_pack_tokens: evidencePack.total_tokens,
    evidence_pack_hash: evidencePack.context_hash,
    evidence_pack: evidencePack,
    raw_answers: {
      agreement_score: consensus.agreement_score,
      consensus_answers: consensus.answers,
      samples: consensus.raw_samples,
    },
    policy_hits: evaluatedDecision.policy_hits,
    created_at: now,
  };
  store.decisionRuns.push(decisionRun);

  changeEvent.is_processed = true;
  persistStore();

  return { candidate, decision_run: decisionRun };
}

export function processUnprocessedChangeEvents(limit = 10): number {
  const pending = Array.from(store.changeEvents.values())
    .filter((ch) => !ch.is_processed)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, limit);

  if (pending.length === 0) return 0;

  let evaluatedCount = 0;
  for (const ch of pending) {
    evaluateChangeEvent(ch);
    evaluatedCount += 1;
  }
  return evaluatedCount;
}

export function addDomainSignoff(params: {
  candidate_id: string;
  role: string;
  signed_by: string;
  notes?: string;
}): LaunchCandidate | null {
  const candidate = store.launchCandidates.get(params.candidate_id);
  if (!candidate) return null;

  const existingIdx = candidate.domain_signoffs.findIndex(
    (s) => s.role === params.role
  );
  const entry = {
    role: params.role,
    signed_by: params.signed_by,
    signed_at: new Date().toISOString(),
    notes: params.notes,
  };
  if (existingIdx >= 0) {
    candidate.domain_signoffs[existingIdx] = entry;
  } else {
    candidate.domain_signoffs.push(entry);
  }

  candidate.reasons.push(
    `Domain sign-off recorded for role '${params.role}' by ${params.signed_by}.`
  );
  recomputeCandidateExternalSafety(candidate);
  persistStore();
  return candidate;
}

export function confirmCandidateTier(params: {
  candidate_id: string;
  confirmed_tier: string;
  override_reason?: string;
}):
  | { ok: true; candidate: LaunchCandidate }
  | { ok: false; statusCode: number; error: string; missing_approvers?: string[] } {
  const candidate = store.launchCandidates.get(params.candidate_id);
  if (!candidate) {
    return { ok: false, statusCode: 404, error: "LaunchCandidate not found." };
  }

  const targetTier = params.confirmed_tier.toUpperCase();
  const signedRoles = new Set(candidate.domain_signoffs.map((s) => s.role));
  const missingApprovers = candidate.required_approvers.filter(
    (role) => !signedRoles.has(role)
  );

  if (targetTier !== "T0" && missingApprovers.length > 0) {
    return {
      ok: false,
      statusCode: 409,
      error: `Cannot confirm external tier ${targetTier} until required domain approvers sign off: ${missingApprovers.join(", ")}`,
      missing_approvers: missingApprovers,
    };
  }

  candidate.confirmed_tier = targetTier;
  candidate.status = targetTier === "T0" ? "CONFIRMED" : "CONFIRMED";
  if (params.override_reason) {
    candidate.reasons.push(`Human PMM override: ${params.override_reason}`);
  }
  recomputeCandidateExternalSafety(candidate);
  persistStore();
  return { ok: true, candidate };
}

export function rejectCandidate(params: {
  candidate_id: string;
  reason: string;
}): LaunchCandidate | null {
  const candidate = store.launchCandidates.get(params.candidate_id);
  if (!candidate) return null;
  candidate.status = "REJECTED";
  candidate.is_external_safe = false;
  candidate.reasons.push(`Candidate rejected by reviewer: ${params.reason}`);
  persistStore();
  return candidate;
}
