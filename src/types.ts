export type SourceType = "GITHUB" | "JIRA" | "SLACK";
export type TrustLabel = "INTERNAL" | "EXTERNAL_UNTRUSTED";

export enum LinkType {
  L1_IMPLEMENTS = "implements",
  L2_MENTIONS = "mentions",
  L3_FIXES = "fixes",
  L4_REVERTS = "reverts",
  L5_CONTAINS = "contains",
  L6_RELATES_TO = "relates_to",
  L7_DUPLICATE_OF = "duplicate_of",
  L8_BLOCKS = "blocks",
}

export enum ConfidenceBand {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum LaunchTier {
  T0 = "T0",
  T1 = "T1",
  T2 = "T2",
  T3 = "T3",
}

export enum PolicyEffect {
  ESCALATE_TIER = "ESCALATE_TIER",
  REQUIRE_DOMAIN_APPROVER = "REQUIRE_DOMAIN_APPROVER",
  ADD_BLOCKING_FINDING = "ADD_BLOCKING_FINDING",
  SUPPRESS_LAUNCH = "SUPPRESS_LAUNCH",
}

export type LintCode =
  | "LINT-CODENAME"
  | "LINT-UNCITED"
  | "LINT-TOKEN"
  | "LINT-COMPETITOR"
  | "LINT-SUPERLATIVE"
  | "LINT-PRICING"
  | "LINT-TIMING"
  | "LINT-EMBARGO"
  | "LINT-LENGTH"
  | "LINT-PROFANITY"
  | "LINT-SECURITY"
  | "LINT-FORMAT"
  | "LINT-PERSONA"
  | "LINT-DISALLOWED-CLAIM";

export type AssetType =
  | "INTERNAL_BRIEF"
  | "CHANGELOG"
  | "RELEASE_NOTE"
  | "EMAIL"
  | "SALES_SNIPPET"
  | "SUPPORT_FAQ"
  | "LINKEDIN"
  | "PRODUCT_BLOG"
  | "X_THREAD";

export interface LintFinding {
  id: string;
  rule_code: LintCode;
  severity: "BLOCKER" | "WARNING";
  message: string;
  snippet?: string;
  is_overridden: boolean;
  override_reason?: string;
}

export interface GtmDraft {
  id: string;
  workspace_id: string;
  launch_candidate_id: string;
  asset_type: AssetType;
  title: string;
  content: string;
  citations: string[];
  lint_findings: LintFinding[];
  is_external_safe: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandProfile {
  product_summary: string;
  voice_tone: string;
  codenames: string[];
  competitors: string[];
  disallowed_claims: string[];
}

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  tier: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Connection {
  id: string;
  workspace_id: string;
  source_type: SourceType;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface WebhookInboxEntry {
  id: string;
  connection_id: string;
  idempotency_key: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  received_at: string;
}

export interface SourceEvent {
  id: string;
  workspace_id: string;
  connection_id: string;
  source_type: SourceType;
  external_id: string;
  trust_label: TrustLabel;
  raw_payload: Record<string, unknown>;
  is_processed: boolean;
  created_at: string;
}

export interface ChangeEvent {
  id: string;
  workspace_id: string;
  anchor_ref: string;
  title: string;
  description: string | null;
  state: string;
  availability: string;
  last_activity_at: string;
  is_processed: boolean;
  created_at: string;
}

export interface ChangeMembership {
  id: string;
  change_event_id: string;
  source_event_id: string | null;
  ref_type: string;
  ref_key: string;
  link_type: string;
  role: string;
  attached_by: string;
  reason: string | null;
  is_active: boolean;
  unlinked_at?: string | null;
  unlinked_by?: string | null;
  unlink_reason?: string | null;
  created_at: string;
}

export interface LinkSuggestion {
  id: string;
  workspace_id: string;
  change_event_id: string;
  source_event_id: string;
  score: number;
  feature_breakdown: Record<string, number>;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface EvidenceChunk {
  chunk_id: string;
  source_ref: string;
  trust_label: string;
  content: string;
  token_count: number;
}

export interface EvidencePack {
  workspace_id: string;
  change_event_id: string;
  chunks: EvidenceChunk[];
  total_tokens: number;
  context_hash: string;
}

export interface QuestionAnswer {
  question_id: string;
  question_text: string;
  answer: unknown;
  confidence: ConfidenceBand;
  citations: string[];
  rationale: string;
}

export interface JudgmentConsensus {
  k_samples: number;
  consensus_tier: LaunchTier;
  confidence: ConfidenceBand;
  score: number;
  answers: QuestionAnswer[];
  raw_samples: Array<Record<string, unknown>>;
  agreement_score: number;
}

export interface PolicyRuleDef {
  code: string;
  name: string;
  description: string;
  effect: PolicyEffect;
  condition: string;
  target_tier?: LaunchTier;
  required_role?: string;
}

export interface DomainSignoff {
  role: string;
  signed_by: string;
  signed_at: string;
  notes?: string;
}

export interface LaunchCandidate {
  id: string;
  workspace_id: string;
  change_event_id: string;
  tier: string;
  confirmed_tier: string | null;
  confidence: string;
  score: number;
  reasons: string[];
  is_external_safe: boolean;
  safety_warnings: string[];
  required_approvers: string[];
  domain_signoffs: DomainSignoff[];
  status: string;
  is_processed: boolean;
  created_at: string;
}

export interface DecisionRun {
  id: string;
  launch_candidate_id: string;
  model_name: string;
  k_samples: number;
  evidence_pack_tokens: number;
  evidence_pack_hash: string;
  evidence_pack?: EvidencePack;
  raw_answers: Record<string, unknown>;
  policy_hits: Array<Record<string, unknown>>;
  created_at: string;
}

export interface PreFlightReport {
  secrets: {
    has_leaks: boolean;
    scrubbed_text: string;
    redaction_count: number;
  };
  references: {
    jira_keys: string[];
    pr_numbers: number[];
    commit_shas: string[];
    predicted_link_type: LinkType;
    predicted_anchor_ref: string;
  };
  sensitivity: {
    security_flags: boolean;
    customer_nda_detected: boolean;
    compliance_flag: boolean;
    pricing_impact: boolean;
    is_embargoed: boolean;
    summary_findings: string[];
  };
  lint_findings: LintFinding[];
  ready_for_push: boolean;
}
