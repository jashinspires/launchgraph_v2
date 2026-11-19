export type SourceType = "GITHUB" | "JIRA" | "SLACK";
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
  rule_code: string;
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

export interface DomainSignoff {
  role: string;
  signed_by: string;
  signed_at: string;
  notes?: string;
}

export interface LaunchCandidateSummary {
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
  created_at: string;
  change_anchor_ref: string;
  change_title: string;
  change_state: string;
  change_availability: string;
  drafts_count: number;
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
  confidence: string;
  citations: string[];
  rationale: string;
}

export interface ChangeEventDetail {
  id: string;
  workspace_id: string;
  anchor_ref: string;
  title: string;
  description: string | null;
  state: string;
  availability: string;
  last_activity_at: string;
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

export interface CandidateDetailResponse {
  candidate: LaunchCandidateSummary;
  change_event: ChangeEventDetail | null;
  memberships: ChangeMembership[];
  latest_decision_run: {
    id: string;
    model_name: string;
    k_samples: number;
    evidence_pack_tokens: number;
    evidence_pack_hash: string;
    evidence_pack?: EvidencePack;
    raw_answers: {
      agreement_score?: number;
      consensus_answers?: QuestionAnswer[];
      samples?: Array<{
        sample_index: number;
        lens?: string;
        temperature: number;
        q9_tier: string;
        q9_rationale: string;
      }>;
    };
    policy_hits: Array<{
      rule_code: string;
      rule_name: string;
      effect: string;
      reason: string;
    }>;
    created_at: string;
  } | null;
  drafts: GtmDraft[];
  tier_asset_matrix: AssetType[];
}

export interface TriageItem {
  id: string;
  workspace_id: string;
  change_event_id: string;
  source_event_id: string;
  score: number;
  feature_breakdown: {
    s_person: number;
    s_time: number;
    s_path: number;
    s_text: number;
  };
  status: string;
  source_external_id: string;
  source_type: string;
  source_snippet: string;
  target_anchor_ref: string;
  target_title: string;
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
    predicted_link_type: string;
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

export interface ExtensionManifestInfo {
  available: boolean;
  package_json: Record<string, unknown> | null;
  extension_entry_preview: string;
  install_commands: string[];
}
