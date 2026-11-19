import type {
  AssetType,
  BrandProfile,
  CandidateDetailResponse,
  ExtensionManifestInfo,
  GtmDraft,
  LaunchCandidateSummary,
  PreFlightReport,
  SourceType,
  TriageItem,
} from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data && (data.detail || data.error)) || `Request failed (${res.status})`
    ) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export const api = {
  getInfo: () =>
    requestJson<{
      service: string;
      version: string;
      counts: Record<string, number>;
    }>("/api/info"),

  scanPreFlight: (payload: {
    title: string;
    body: string;
    branch_name?: string;
    source_type: SourceType;
    draft_copy?: string;
    asset_type?: AssetType;
  }) =>
    requestJson<PreFlightReport>("/api/preflight/scan", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  simulateWebhook: (payload: {
    source: SourceType;
    title: string;
    body: string;
    branch_name?: string;
    labels?: string[];
    merged?: boolean;
    changed_files?: string[];
    jira_key?: string;
    run_pipeline?: boolean;
  }) =>
    requestJson<{
      status: string;
      source: SourceType;
      external_id: string;
      signature_header: string;
      hmac_verified: boolean;
      source_event_id: string;
      normalized_events: number;
      evaluated_changes: number;
    }>("/api/simulator/webhook", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listTriage: () =>
    requestJson<{ count: number; items: TriageItem[] }>("/api/triage/unlinked"),

  acceptTriage: (suggestionId: string) =>
    requestJson<{ status: string }>(`/api/triage/${suggestionId}/accept`, {
      method: "POST",
      body: JSON.stringify({ reviewed_by: "pmm-extension-user" }),
    }),

  rejectTriage: (suggestionId: string) =>
    requestJson<{ status: string }>(`/api/triage/${suggestionId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewed_by: "pmm-extension-user" }),
    }),

  softUnlinkMembership: (membershipId: string, reason: string) =>
    requestJson<{ status: string }>(
      `/api/memberships/${membershipId}/unlink`,
      {
        method: "POST",
        body: JSON.stringify({
          unlinked_by: "pmm-extension-user",
          reason,
        }),
      }
    ),

  listCandidates: (tier?: string) => {
    const q = tier && tier !== "ALL" ? `?tier=${encodeURIComponent(tier)}` : "";
    return requestJson<{ count: number; items: LaunchCandidateSummary[] }>(
      `/api/candidates${q}`
    );
  },

  getCandidateDetail: (candidateId: string) =>
    requestJson<CandidateDetailResponse>(`/api/candidates/${candidateId}`),

  addDomainSignoff: (
    candidateId: string,
    role: string,
    signedBy: string,
    notes?: string
  ) =>
    requestJson<{ status: string; candidate: LaunchCandidateSummary }>(
      `/api/candidates/${candidateId}/signoff`,
      {
        method: "POST",
        body: JSON.stringify({ role, signed_by: signedBy, notes }),
      }
    ),

  confirmCandidate: (
    candidateId: string,
    confirmedTier: string,
    overrideReason?: string
  ) =>
    requestJson<{
      candidate_id: string;
      confirmed_tier: string;
      status: string;
      is_external_safe: boolean;
    }>(`/api/candidates/${candidateId}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        confirmed_tier: confirmedTier,
        override_reason: overrideReason,
      }),
    }),

  rejectCandidate: (candidateId: string, reason: string) =>
    requestJson<{ status: string }>(`/api/candidates/${candidateId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  generateDrafts: (candidateId: string, assetType?: AssetType) =>
    requestJson<{ candidate_id: string; count: number; drafts: GtmDraft[] }>(
      `/api/candidates/${candidateId}/drafts/generate`,
      {
        method: "POST",
        body: JSON.stringify({ asset_type: assetType }),
      }
    ),

  updateDraft: (draftId: string, content: string, citations?: string[]) =>
    requestJson<{ status: string; draft: GtmDraft }>(`/api/drafts/${draftId}`, {
      method: "PUT",
      body: JSON.stringify({ content, citations }),
    }),

  overrideLint: (draftId: string, ruleCode: string, reason: string) =>
    requestJson<{ status: string; draft: GtmDraft }>(
      `/api/drafts/${draftId}/override`,
      {
        method: "POST",
        body: JSON.stringify({ rule_code: ruleCode, reason }),
      }
    ),

  getBrandProfile: () => requestJson<BrandProfile>("/api/brand"),

  updateBrandProfile: (profile: Partial<BrandProfile>) =>
    requestJson<BrandProfile>("/api/brand", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),

  getExtensionManifest: () =>
    requestJson<ExtensionManifestInfo>("/api/extension/manifest"),

  resetDemo: () =>
    requestJson<{ status: string }>("/api/demo/reset", { method: "POST" }),
};
