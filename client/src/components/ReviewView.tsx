import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import type {
  CandidateDetailResponse,
  LaunchCandidateSummary,
  TriageItem,
} from "../types";

interface ReviewWorkspaceProps {
  triageItems: TriageItem[];
  candidates: LaunchCandidateSummary[];
  selectedCandidateId: string | null;
  selectedDetail: CandidateDetailResponse | null;
  tierFilter: string;
  busyId: string | null;
  error: string | null;
  onTierFilterChange: (tier: string) => void;
  onSelectCandidate: (id: string) => void;
  onAcceptTriage: (id: string) => void;
  onRejectTriage: (id: string) => void;
  onSignoff: (role: string, signedBy: string) => void;
  onConfirmTier: (tier: string, reason?: string) => void;
  onRejectCandidate: (reason: string) => void;
  onSoftUnlink: (membershipId: string, reason: string) => void;
  onGoToLinters: () => void;
}

const TIER_LABELS: Record<string, string> = {
  T1: "Tier 1 — Major Flagship Launch",
  T2: "Tier 2 — Targeted Feature Release",
  T3: "Tier 3 — Changelog Note",
  T0: "Tier 0 — Internal Only (No External Copy)",
};

const ROLE_LABELS: Record<string, string> = {
  security_lead: "Security Lead",
  compliance_officer: "Compliance Officer",
  gtm_vp: "GTM VP",
  product_lead: "Product Lead",
};

function formatStatusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "SUPPRESSED":
      return "Held by Policy";
    default:
      return "Needs Review";
  }
}

export const ReviewWorkspace: React.FC<ReviewWorkspaceProps> = ({
  triageItems,
  candidates,
  selectedCandidateId,
  selectedDetail,
  tierFilter,
  busyId,
  error,
  onTierFilterChange,
  onSelectCandidate,
  onAcceptTriage,
  onRejectTriage,
  onSignoff,
  onConfirmTier,
  onRejectCandidate,
  onSoftUnlink,
  onGoToLinters,
}) => {
  const [subTab, setSubTab] = useState<"perspectives" | "evidence" | "links">(
    "perspectives"
  );
  const [selectedTierToConfirm, setSelectedTierToConfirm] = useState("T2");
  const [overrideReason, setOverrideReason] = useState("");
  const [signerName, setSignerName] = useState("alex-reviewer");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [unlinkTargetId, setUnlinkTargetId] = useState<string | null>(null);
  const [unlinkReason, setUnlinkReason] = useState("");

  const activeCandidate = selectedDetail?.candidate;
  const signedRoles = new Set(
    activeCandidate?.domain_signoffs.map((s) => s.role) || []
  );

  useEffect(() => {
    if (activeCandidate) {
      setSelectedTierToConfirm(
        activeCandidate.confirmed_tier || activeCandidate.tier
      );
      setShowRejectBox(false);
    }
  }, [activeCandidate?.id, activeCandidate?.tier, activeCandidate?.confirmed_tier]);

  const changeEvent = selectedDetail?.change_event;
  const memberships = selectedDetail?.memberships || [];
  const latestRun = selectedDetail?.latest_decision_run;
  const pack = latestRun?.evidence_pack;
  const consensusAnswers = latestRun?.raw_answers?.consensus_answers || [];
  const samples = latestRun?.raw_answers?.samples || [];
  const policyHits = latestRun?.policy_hits || [];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Left Queue Column: Clean selector list only */}
      <aside className="w-full shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] lg:w-80 overflow-y-auto p-4 space-y-5">
        {triageItems.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
                Unlinked Messages ({triageItems.length})
              </h2>
            </div>
            <div className="space-y-2">
              {triageItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-amber-300/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      Link to {item.target_anchor_ref}?
                    </span>
                    <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
                      {Math.round(item.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {item.source_snippet}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => onAcceptTriage(item.id)}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Accept Link
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => onRejectTriage(item.id)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white">
              Features to Review ({candidates.length})
            </h2>
          </div>

          <div
            role="group"
            aria-label="Filter launches by tier"
            className="grid grid-cols-5 gap-1 rounded-md bg-slate-100 dark:bg-[#0D1117] p-1 border border-slate-200 dark:border-slate-800"
          >
            {["ALL", "T0", "T1", "T2", "T3"].map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => onTierFilterChange(tier)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tierFilter === tier
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {tier === "ALL" ? "All" : tier}
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {candidates.length === 0 ? (
              <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                No launch candidates match this filter.
              </p>
            ) : (
              candidates.map((cand) => {
                const isSelected = cand.id === selectedCandidateId;
                const activeTier = cand.confirmed_tier || cand.tier;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => onSelectCandidate(cand.id)}
                    className={`block w-full text-left px-3 py-3 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                        {cand.change_title}
                      </span>
                      <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0 tabular-nums">
                        {activeTier}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{cand.change_anchor_ref}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          cand.status === "CONFIRMED"
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : cand.status === "REJECTED" ||
                                cand.status === "SUPPRESSED"
                              ? "font-medium text-red-600 dark:text-red-400"
                              : "font-medium text-amber-600 dark:text-amber-400"
                        }
                      >
                        {formatStatusLabel(cand.status)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </aside>

      {/* Main Detail Canvas */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedDetail || !activeCandidate ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            Pick a feature from the left list to review its approvals, AI reasoning, and evidence.
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {changeEvent?.anchor_ref}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Code: {changeEvent?.state}</span>
                  <span aria-hidden="true">·</span>
                  <span>Availability: {changeEvent?.availability}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      activeCandidate.is_external_safe
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "font-semibold text-amber-600 dark:text-amber-400"
                    }
                  >
                    {activeCandidate.is_external_safe
                      ? "External Safe"
                      : "Needs Sign-Off / Check"}
                  </span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {changeEvent?.title}
                </h1>
              </div>

              <button
                type="button"
                onClick={onGoToLinters}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Step 3: Draft Copy &amp; Linters
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {/* Approval & Tier Decision Card */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Step 2: Approve Launch Tier &amp; Required Sign-Offs
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Proposed recommendation:{" "}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {TIER_LABELS[activeCandidate.tier] || activeCandidate.tier}
                    </span>
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  Impact Score: {activeCandidate.score}/100
                </span>
              </div>

              {activeCandidate.safety_warnings.length > 0 && (
                <div className="rounded-md border border-amber-300/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Policy Attention Items
                  </div>
                  <ul className="space-y-0.5 text-xs text-amber-800/90 dark:text-amber-200/90">
                    {activeCandidate.safety_warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activeCandidate.required_approvers.length > 0 && (
                <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1117] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Required Sign-Offs Before External Launch
                    </span>
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="reviewer-name-input"
                        className="text-xs text-slate-500 dark:text-slate-400"
                      >
                        Reviewer:
                      </label>
                      <input
                        id="reviewer-name-input"
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        className="w-32 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activeCandidate.required_approvers.map((role) => {
                      const isSigned = signedRoles.has(role);
                      return (
                        <div
                          key={role}
                          className="flex items-center justify-between gap-3 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {ROLE_LABELS[role] || role}
                          </span>
                          {isSigned ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Signed
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === `signoff:${role}`}
                              onClick={() => onSignoff(role, signerName || "pmm-lead")}
                              className="rounded bg-blue-600/10 border border-blue-600/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-600/20 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Record Sign-Off
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end pt-1">
                <div className="space-y-1 sm:col-span-4">
                  <label
                    htmlFor="confirm-tier-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Final Launch Tier
                  </label>
                  <select
                    id="confirm-tier-select"
                    value={selectedTierToConfirm}
                    onChange={(e) => setSelectedTierToConfirm(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="T1">T1 — Major Flagship</option>
                    <option value="T2">T2 — Targeted Release</option>
                    <option value="T3">T3 — Changelog Update</option>
                    <option value="T0">T0 — Internal Only</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-5">
                  <label
                    htmlFor="confirm-note-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Reviewer Note (optional)
                  </label>
                  <input
                    id="confirm-note-input"
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Reason for tier choice..."
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-3">
                  <button
                    type="button"
                    disabled={busyId === "confirm"}
                    onClick={() =>
                      onConfirmTier(
                        selectedTierToConfirm,
                        overrideReason.trim() || undefined
                      )
                    }
                    className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {busyId === "confirm" ? "Saving..." : "Confirm Tier"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectBox(!showRejectBox)}
                    className="rounded-md border border-red-300 dark:border-red-900 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {showRejectBox && (
                <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <input
                    type="text"
                    aria-label="Rejection reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why should this launch be rejected? (min 5 chars)"
                    className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={busyId === "reject" || rejectReason.trim().length < 5}
                    onClick={() => {
                      onRejectCandidate(rejectReason.trim());
                      setRejectReason("");
                      setShowRejectBox(false);
                    }}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Confirm Rejection
                  </button>
                </div>
              )}
            </section>

            {/* Evidence & Reasoning Tabs */}
            <section className="space-y-4">
              <div
                role="tablist"
                aria-label="Candidate analysis tabs"
                className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800"
              >
                {(
                  [
                    ["perspectives", "Why This Tier? (3 Perspectives)"],
                    [
                      "evidence",
                      `Source Evidence (${pack?.chunks.length ?? 0} chunks)`,
                    ],
                    [
                      "links",
                      `Linked Tickets & PRs (${memberships.filter((m) => m.is_active).length})`,
                    ],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={subTab === id}
                    onClick={() => setSubTab(id)}
                    className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      subTab === id
                        ? "border-blue-600 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {subTab === "perspectives" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {samples.map((s) => (
                      <div
                        key={s.sample_index}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {s.lens || `Reviewer #${s.sample_index + 1}`}
                          </span>
                          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {s.q9_tier}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {s.q9_rationale}
                        </p>
                      </div>
                    ))}
                  </div>

                  {policyHits.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4 space-y-2.5">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                        Automatic Policy Rules Applied
                      </h3>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {policyHits.map((hit, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {hit.rule_name}
                              </span>{" "}
                              <span className="font-mono text-slate-500">
                                ({hit.rule_code})
                              </span>
                              <p className="text-slate-600 dark:text-slate-400">
                                {hit.reason}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1117] text-slate-600 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Question</th>
                          <th className="px-4 py-2.5 font-medium">Classification</th>
                          <th className="px-4 py-2.5 font-medium">Explanation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {consensusAnswers.map((qa) => (
                          <tr key={qa.question_id}>
                            <td className="px-4 py-2.5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {qa.question_id}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              {String(qa.answer)}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                              {qa.rationale}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {subTab === "evidence" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Evidence Budget:{" "}
                      <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                        {latestRun?.evidence_pack_tokens ?? 0} / 12,000 tokens
                      </strong>
                    </span>
                    <span className="font-mono">
                      Hash: {latestRun?.evidence_pack_hash.slice(0, 16) || "N/A"}...
                    </span>
                  </div>

                  {pack?.chunks.map((chunk) => (
                    <div
                      key={chunk.chunk_id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22]"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-mono">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {chunk.source_ref} · [{chunk.chunk_id}]
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {chunk.token_count} tokens
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {chunk.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {subTab === "links" && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22]">
                  {memberships.map((m) => (
                    <div key={m.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {m.ref_key}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-blue-600 dark:text-blue-400">
                            {m.link_type}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={
                              m.is_active
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-slate-500 line-through"
                            }
                          >
                            {m.is_active ? "Linked" : "Unlinked"}
                          </span>
                        </div>

                        {m.is_active && (
                          <button
                            type="button"
                            onClick={() => {
                              setUnlinkTargetId(
                                unlinkTargetId === m.id ? null : m.id
                              );
                              setUnlinkReason("");
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Unlink className="h-3 w-3" aria-hidden="true" />
                            Unlink
                          </button>
                        )}
                      </div>

                      {!m.is_active && m.unlink_reason && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Unlinked ({m.unlinked_by}): {m.unlink_reason}
                        </p>
                      )}

                      {unlinkTargetId === m.id && m.is_active && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            aria-label={`Audit reason for unlinking ${m.ref_key}`}
                            value={unlinkReason}
                            onChange={(e) => setUnlinkReason(e.target.value)}
                            placeholder="Why are you unlinking this? (min 5 chars)"
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={unlinkReason.trim().length < 5}
                            onClick={() => {
                              onSoftUnlink(m.id, unlinkReason.trim());
                              setUnlinkTargetId(null);
                              setUnlinkReason("");
                            }}
                            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 cursor-pointer"
                          >
                            Confirm Unlink
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
