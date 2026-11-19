import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AssetType,
  BrandProfile,
  CandidateDetailResponse,
  GtmDraft,
  LaunchCandidateSummary,
} from "../types";

const ASSET_LABELS: Record<AssetType, string> = {
  CHANGELOG: "Changelog",
  EMAIL: "Customer Email",
  RELEASE_NOTE: "Release Note",
  SALES_SNIPPET: "Sales Enablement",
  SUPPORT_FAQ: "Support FAQ",
  LINKEDIN: "LinkedIn Post",
  PRODUCT_BLOG: "Product Blog",
  INTERNAL_BRIEF: "Internal Brief",
  X_THREAD: "X / Social Post",
};

const ASSET_BUDGETS: Record<AssetType, number> = {
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

interface LintersWorkspaceProps {
  candidates: LaunchCandidateSummary[];
  selectedCandidateId: string | null;
  detail: CandidateDetailResponse | null;
  selectedDraft: GtmDraft | null;
  brandProfile: BrandProfile | null;
  busy: boolean;
  error: string | null;
  onSelectCandidate: (id: string) => void;
  onSelectDraft: (draftId: string) => void;
  onGenerateDrafts: () => void;
  onSaveDraft: (draftId: string, content: string) => void;
  onOverrideWarning: (draftId: string, ruleCode: string, reason: string) => void;
  onUpdateBrandProfile: (next: Partial<BrandProfile>) => void;
}

export const LintersWorkspace: React.FC<LintersWorkspaceProps> = ({
  candidates,
  selectedCandidateId,
  detail,
  selectedDraft,
  brandProfile,
  busy,
  error,
  onSelectCandidate,
  onSelectDraft,
  onGenerateDrafts,
  onSaveDraft,
  onOverrideWarning,
  onUpdateBrandProfile,
}) => {
  const [content, setContent] = useState("");
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showAll14, setShowAll14] = useState(false);
  const [showBrandEditor, setShowBrandEditor] = useState(false);
  const [codenamesInput, setCodenamesInput] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [claimsInput, setClaimsInput] = useState("");

  useEffect(() => {
    setContent(selectedDraft?.content || "");
  }, [selectedDraft?.id, selectedDraft?.content]);

  useEffect(() => {
    if (brandProfile) {
      setCodenamesInput(brandProfile.codenames.join(", "));
      setCompetitorsInput(brandProfile.competitors.join(", "));
      setClaimsInput(brandProfile.disallowed_claims.join(", "));
    }
  }, [brandProfile]);

  const drafts = detail?.drafts || [];
  const findings = selectedDraft?.lint_findings || [];
  const blockers = findings.filter((f) => f.severity === "BLOCKER");
  const activeWarnings = findings.filter(
    (f) => f.severity === "WARNING" && !f.is_overridden
  );
  const maxBudget = selectedDraft
    ? ASSET_BUDGETS[selectedDraft.asset_type] || 1500
    : 1500;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header + Candidate Picker + Generate Action */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Step 3: Draft Customer Copy &amp; Check Safety Rules
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Generate drafts backed by verified engineering evidence and pass all 14 safety linters before publishing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="linters-feature-select"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Feature:
            </label>
            <select
              id="linters-feature-select"
              value={selectedCandidateId || ""}
              onChange={(e) => onSelectCandidate(e.target.value)}
              className="max-w-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.change_anchor_ref} · {c.change_title} (Tier{" "}
                  {c.confirmed_tier || c.tier})
                </option>
              ))}
            </select>
          </div>

          {detail && (
            <button
              type="button"
              disabled={busy}
              onClick={onGenerateDrafts}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {drafts.length > 0 ? "Refresh Drafts" : "Generate Drafts"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Channel Tabs */}
      {drafts.length > 0 && (
        <div
          role="tablist"
          aria-label="GTM Draft Channels"
          className="flex flex-wrap items-center gap-2"
        >
          {drafts.map((d) => {
            const isSelected = d.id === selectedDraft?.id;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectDraft(d.id)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {ASSET_LABELS[d.asset_type] || d.asset_type}
              </button>
            );
          })}
        </div>
      )}

      {!selectedDraft ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-8 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No marketing drafts generated yet for this feature.
          </p>
          {detail && (
            <button
              type="button"
              disabled={busy}
              onClick={onGenerateDrafts}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate Drafts Now
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left: Draft Markdown Editor */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-5 space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {selectedDraft.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {content.length} / {maxBudget} characters · Citations:{" "}
                  {selectedDraft.citations.join(", ") || "None"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSaveDraft(selectedDraft.id, content)}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {busy ? "Checking..." : "Save & Check Rules"}
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="draft-markdown-editor"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Copy Editor (try adding &quot;Project Apollo&quot; or &quot;best-in-class&quot; to see blockers &amp; warnings)
              </label>
              <textarea
                id="draft-markdown-editor"
                rows={13}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D1117] p-4 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </section>

          {/* Right: Clear Safety Audit & Brand Settings */}
          <section className="space-y-4 lg:col-span-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Safety Audit
                </h2>
                {selectedDraft.is_external_safe ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Safe to Publish
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    {blockers.length} Blocker · {activeWarnings.length} Warning
                  </span>
                )}
              </div>

              {findings.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20 px-3.5 py-3 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  All 14 safety linters passed cleanly.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
                  {findings.map((f) => (
                    <div key={f.id} className="py-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono font-semibold ${
                            f.severity === "BLOCKER"
                              ? "text-red-600 dark:text-red-400"
                              : f.is_overridden
                                ? "text-slate-500 line-through"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {f.severity} · {f.rule_code}
                        </span>

                        {f.severity === "WARNING" && !f.is_overridden && (
                          <button
                            type="button"
                            onClick={() => {
                              setOverrideTarget(
                                overrideTarget === f.rule_code ? null : f.rule_code
                              );
                              setOverrideReason("");
                            }}
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Approve Exception
                          </button>
                        )}
                        {f.is_overridden && (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            Approved
                          </span>
                        )}
                      </div>

                      <p className="text-slate-700 dark:text-slate-300">
                        {f.message}
                      </p>

                      {f.severity === "BLOCKER" && (
                        <p className="text-[11px] text-red-600 dark:text-red-400">
                          Must fix in copy editor — blockers cannot be overridden.
                        </p>
                      )}

                      {f.is_overridden && f.override_reason && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Note: {f.override_reason}
                        </p>
                      )}

                      {overrideTarget === f.rule_code && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            aria-label={`Override rationale for ${f.rule_code}`}
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Why is this exception safe? (min 5 chars)"
                            className="flex-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={overrideReason.trim().length < 5}
                            onClick={() => {
                              onOverrideWarning(
                                selectedDraft.id,
                                f.rule_code,
                                overrideReason.trim()
                              );
                              setOverrideTarget(null);
                              setOverrideReason("");
                            }}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Accordion: Full 14-Rule Checklist */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAll14(!showAll14)}
                  className="flex w-full items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <span>View all 14 safety rules</span>
                  {showAll14 ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                {showAll14 && (
                  <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    {[
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
                    ].map((code) => {
                      const hit = findings.find((f) => f.rule_code === code);
                      return (
                        <li
                          key={code}
                          className={
                            hit
                              ? hit.is_overridden
                                ? "text-slate-400 line-through"
                                : hit.severity === "BLOCKER"
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }
                        >
                          {hit ? (hit.is_overridden ? "~" : "!") : "✓"} {code}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Accordion: Brand Blocklist Settings */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-4">
              <button
                type="button"
                onClick={() => setShowBrandEditor(!showBrandEditor)}
                className="flex w-full items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <span>Brand Blocklist &amp; Guardrails</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {showBrandEditor ? "Hide" : "Edit"}
                </span>
              </button>

              {showBrandEditor && (
                <div className="mt-3 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="brand-codenames"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Internal Codenames (blocked externally)
                    </label>
                    <input
                      id="brand-codenames"
                      type="text"
                      value={codenamesInput}
                      onChange={(e) => setCodenamesInput(e.target.value)}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="brand-competitors"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Competitors (flagged for review)
                    </label>
                    <input
                      id="brand-competitors"
                      type="text"
                      value={competitorsInput}
                      onChange={(e) => setCompetitorsInput(e.target.value)}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="brand-claims"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                    >
                      Disallowed Claims
                    </label>
                    <input
                      id="brand-claims"
                      type="text"
                      value={claimsInput}
                      onChange={(e) => setClaimsInput(e.target.value)}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateBrandProfile({
                        codenames: codenamesInput
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                        competitors: competitorsInput
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                        disallowed_claims: claimsInput
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Save Guardrails
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
