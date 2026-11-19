import React from "react";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Link2,
  ScanSearch,
  Send,
  ShieldAlert,
} from "lucide-react";
import type { PreFlightReport, SourceType } from "../types";

export interface PreFlightFormState {
  source: SourceType;
  title: string;
  branch_name: string;
  labels: string;
  body: string;
  draft_copy: string;
}

export interface LastSimulationResult {
  external_id: string;
  source: SourceType;
  signature_header: string;
  hmac_verified: boolean;
  normalized_events: number;
  evaluated_changes: number;
}

interface PreFlightWorkspaceProps {
  form: PreFlightFormState;
  report: PreFlightReport | null;
  scanning: boolean;
  simulating: boolean;
  simResult: LastSimulationResult | null;
  error: string | null;
  onChange: (next: PreFlightFormState) => void;
  onLoadPreset: (preset: "clean" | "secret" | "breaking") => void;
  onScan: () => void;
  onSimulateWebhook: () => void;
  onGoToReview: () => void;
}

export const PreFlightWorkspace: React.FC<PreFlightWorkspaceProps> = ({
  form,
  report,
  scanning,
  simulating,
  simResult,
  error,
  onChange,
  onLoadPreset,
  onScan,
  onSimulateWebhook,
  onGoToReview,
}) => {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Step Intro & Sample Presets */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Step 1: Check Your Change Before Sending
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Scan a pull request, Jira ticket, or Slack message for leaked secrets and compliance flags, then send it to the LaunchGraph pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Try sample:
          </span>
          <button
            type="button"
            onClick={() => onLoadPreset("clean")}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Clean Feature PR
          </button>
          <button
            type="button"
            onClick={() => onLoadPreset("secret")}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Secret Leak + SOC2
          </button>
          <button
            type="button"
            onClick={() => onLoadPreset("breaking")}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161B22] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Breaking API Change
          </button>
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

      {simResult && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-300 dark:border-emerald-900/70 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3">
          <div className="space-y-0.5 text-sm">
            <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Sent to LaunchGraph ({simResult.external_id}) · HMAC signature verified
              </span>
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Processed {simResult.normalized_events} source event(s) and created{" "}
              {simResult.evaluated_changes} launch review item(s).
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToReview}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open in Launch Review
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Left: Input Form | Right: Clear Scan Results */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Form */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-5 space-y-4 lg:col-span-7">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Change Details
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="pf-source"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Source
              </label>
              <select
                id="pf-source"
                value={form.source}
                onChange={(e) =>
                  onChange({ ...form, source: e.target.value as SourceType })
                }
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="GITHUB">GitHub Pull Request</option>
                <option value="JIRA">Jira Ticket</option>
                <option value="SLACK">Slack Message</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pf-branch"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Branch Name
              </label>
              <input
                id="pf-branch"
                type="text"
                value={form.branch_name}
                onChange={(e) => onChange({ ...form, branch_name: e.target.value })}
                placeholder="feature/PROD-104-sso"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pf-labels"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Release Stage Labels
              </label>
              <input
                id="pf-labels"
                type="text"
                value={form.labels}
                onChange={(e) => onChange({ ...form, labels: e.target.value })}
                placeholder="ga, beta, or internal"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pf-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Title
            </label>
            <input
              id="pf-title"
              type="text"
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              placeholder="Fix PROD-104 Add SCIM group provisioning"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pf-body"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Description / Notes
            </label>
            <textarea
              id="pf-body"
              rows={6}
              value={form.body}
              onChange={(e) => onChange({ ...form, body: e.target.value })}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] p-3 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pf-draft-copy"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Optional Customer Changelog Snippet (checked against 14 marketing rules)
            </label>
            <textarea
              id="pf-draft-copy"
              rows={2}
              value={form.draft_copy}
              onChange={(e) => onChange({ ...form, draft_copy: e.target.value })}
              placeholder="Leave blank or paste draft release note text to test codename/pricing/superlative checks..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] p-3 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onScan}
              disabled={scanning}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
              {scanning ? "Scanning..." : "Run Safety Check"}
            </button>

            <button
              type="button"
              onClick={onSimulateWebhook}
              disabled={simulating}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1117] px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {simulating ? "Sending..." : "Send to LaunchGraph Pipeline"}
            </button>
          </div>
        </section>

        {/* Right Result Panel */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] p-5 space-y-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Pre-Flight Report
            </h2>
            {report && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  report.ready_for_push
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {report.ready_for_push ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Ready to Send
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Needs Attention
                  </>
                )}
              </span>
            )}
          </div>

          {!report ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click <span className="font-semibold">Run Safety Check</span> to inspect secrets, ticket links, and compliance triggers.
            </p>
          ) : (
            <div className="space-y-5">
              {/* 1. Secrets */}
              <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    1. Leaked Credentials
                  </span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      report.secrets.has_leaks
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {report.secrets.redaction_count} found
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {report.secrets.has_leaks
                    ? "Detected secret tokens or keys. LaunchGraph automatically redacts them before saving."
                    : "No API tokens, AWS keys, passwords, or private keys detected."}
                </p>
                {report.secrets.has_leaks && (
                  <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {report.secrets.scrubbed_text}
                  </pre>
                )}
              </div>

              {/* 2. Linked Ticket */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Link2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  2. Feature Grouping
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-500 dark:text-slate-400">Links to feature</div>
                  <div className="text-right font-mono font-semibold text-slate-900 dark:text-white">
                    {report.references.predicted_anchor_ref}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">Relationship</div>
                  <div className="text-right font-mono text-blue-600 dark:text-blue-400">
                    {report.references.predicted_link_type}
                  </div>
                </div>
              </div>

              {/* 3. Policy Sensitivity */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <AlertTriangle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  3. Compliance &amp; Approval Gates
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Security / CVE</span>
                    <span
                      className={
                        report.sensitivity.security_flags
                          ? "font-semibold text-amber-600 dark:text-amber-400"
                          : "text-slate-500"
                      }
                    >
                      {report.sensitivity.security_flags ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">SOC2 / GDPR</span>
                    <span
                      className={
                        report.sensitivity.compliance_flag
                          ? "font-semibold text-amber-600 dark:text-amber-400"
                          : "text-slate-500"
                      }
                    >
                      {report.sensitivity.compliance_flag ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Pricing</span>
                    <span
                      className={
                        report.sensitivity.pricing_impact
                          ? "font-semibold text-amber-600 dark:text-amber-400"
                          : "text-slate-500"
                      }
                    >
                      {report.sensitivity.pricing_impact ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Embargo / NDA</span>
                    <span
                      className={
                        report.sensitivity.is_embargoed ||
                        report.sensitivity.customer_nda_detected
                          ? "font-semibold text-red-600 dark:text-red-400"
                          : "text-slate-500"
                      }
                    >
                      {report.sensitivity.is_embargoed ||
                      report.sensitivity.customer_nda_detected
                        ? "Yes"
                        : "No"}
                    </span>
                  </div>
                </div>
                {report.sensitivity.summary_findings.length > 0 && (
                  <ul className="space-y-1 pt-1 text-xs text-amber-700 dark:text-amber-300">
                    {report.sensitivity.summary_findings.map((msg, idx) => (
                      <li key={idx}>• {msg}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 4. Optional Snippet Lints */}
              {report.lint_findings.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    4. Release Snippet Warnings ({report.lint_findings.length})
                  </span>
                  <ul className="space-y-1.5 text-xs">
                    {report.lint_findings.map((f) => (
                      <li key={f.id}>
                        <span
                          className={`font-mono font-semibold ${
                            f.severity === "BLOCKER"
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {f.severity} · {f.rule_code}
                        </span>
                        <p className="text-slate-600 dark:text-slate-400">{f.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
