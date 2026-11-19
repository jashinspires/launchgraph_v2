import React, { useCallback, useEffect, useState } from "react";
import { Blocks, Moon, RotateCcw, Sun } from "lucide-react";
import { api } from "./api";
import { ExtensionBundleModal } from "./components/ExtensionBundleModal";
import { LintersWorkspace } from "./components/LintersView";
import {
  LastSimulationResult,
  PreFlightFormState,
  PreFlightWorkspace,
} from "./components/PreFlightView";
import { ReviewWorkspace } from "./components/ReviewView";
import type {
  BrandProfile,
  CandidateDetailResponse,
  ExtensionManifestInfo,
  LaunchCandidateSummary,
  PreFlightReport,
  TriageItem,
} from "./types";

type ActiveStep = "preflight" | "review" | "linters";

const INITIAL_PREFLIGHT_FORM: PreFlightFormState = {
  source: "GITHUB",
  title: "Fix PROD-104 Add SCIM group provisioning for Okta enterprise tenants",
  branch_name: "feature/PROD-104-scim-sync",
  labels: "ga, docs",
  body: "Implements automated SCIM 2.0 group provisioning with Okta callback verification. Documentation added in docs/scim-setup.md.",
  draft_copy: "",
};

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [activeStep, setActiveStep] = useState<ActiveStep>("preflight");

  // Step 1: Pre-Flight State
  const [pfForm, setPfForm] = useState<PreFlightFormState>(INITIAL_PREFLIGHT_FORM);
  const [pfReport, setPfReport] = useState<PreFlightReport | null>(null);
  const [pfScanning, setPfScanning] = useState(false);
  const [pfSimulating, setPfSimulating] = useState(false);
  const [pfSimResult, setPfSimResult] = useState<LastSimulationResult | null>(null);
  const [pfError, setPfError] = useState<string | null>(null);

  // Step 2: Review & Governance State
  const [triageItems, setTriageItems] = useState<TriageItem[]>([]);
  const [candidates, setCandidates] = useState<LaunchCandidateSummary[]>([]);
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CandidateDetailResponse | null>(
    null
  );
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Step 3: Linters & Drafts State
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [lintBusy, setLintBusy] = useState(false);
  const [lintError, setLintError] = useState<string | null>(null);

  // VS Code Extension Modal
  const [extModalOpen, setExtModalOpen] = useState(false);
  const [extManifest, setExtManifest] = useState<ExtensionManifestInfo | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const loadWorkspaceData = useCallback(
    async (preferredCandidateId?: string | null) => {
      try {
        const [triageRes, candRes, brandRes] = await Promise.all([
          api.listTriage(),
          api.listCandidates(tierFilter),
          api.getBrandProfile(),
        ]);
        setTriageItems(triageRes.items);
        setCandidates(candRes.items);
        setBrandProfile(brandRes);

        const targetId =
          preferredCandidateId !== undefined
            ? preferredCandidateId
            : selectedCandidateId &&
                candRes.items.some((c) => c.id === selectedCandidateId)
              ? selectedCandidateId
              : candRes.items[0]?.id || null;

        setSelectedCandidateId(targetId);
        if (targetId) {
          const detailRes = await api.getCandidateDetail(targetId);
          setSelectedDetail(detailRes);
          setSelectedDraftId((prev) =>
            prev && detailRes.drafts.some((d) => d.id === prev)
              ? prev
              : detailRes.drafts[0]?.id || null
          );
        } else {
          setSelectedDetail(null);
          setSelectedDraftId(null);
        }
      } catch (err) {
        setReviewError(
          err instanceof Error ? err.message : "Failed to load LaunchGraph data."
        );
      }
    },
    [tierFilter, selectedCandidateId]
  );

  useEffect(() => {
    void loadWorkspaceData();
  }, [tierFilter]);

  useEffect(() => {
    void handleScanPreFlight();
  }, []);

  const handleSelectCandidate = async (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setReviewError(null);
    setLintError(null);
    try {
      const detail = await api.getCandidateDetail(candidateId);
      setSelectedDetail(detail);
      setSelectedDraftId(detail.drafts[0]?.id || null);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Failed to load feature details."
      );
    }
  };

  async function handleScanPreFlight() {
    setPfScanning(true);
    setPfError(null);
    try {
      const report = await api.scanPreFlight({
        title: pfForm.title,
        body: pfForm.body,
        branch_name: pfForm.branch_name,
        source_type: pfForm.source,
        draft_copy: pfForm.draft_copy.trim() || undefined,
        asset_type: "CHANGELOG",
      });
      setPfReport(report);
    } catch (err) {
      setPfError(err instanceof Error ? err.message : "Pre-Flight scan failed.");
    } finally {
      setPfScanning(false);
    }
  }

  const handleSimulateWebhook = async () => {
    setPfSimulating(true);
    setPfError(null);
    try {
      const labels = pfForm.labels
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.simulateWebhook({
        source: pfForm.source,
        title: pfForm.title,
        body: pfForm.body,
        branch_name: pfForm.branch_name,
        labels,
        merged: true,
        run_pipeline: true,
      });
      setPfSimResult(res);
      await loadWorkspaceData(null);
    } catch (err) {
      setPfError(err instanceof Error ? err.message : "Failed to send webhook.");
    } finally {
      setPfSimulating(false);
    }
  };

  const handleLoadPreset = (preset: "clean" | "secret" | "breaking") => {
    setPfSimResult(null);
    if (preset === "clean") {
      setPfForm(INITIAL_PREFLIGHT_FORM);
    } else if (preset === "secret") {
      setPfForm({
        source: "GITHUB",
        title: "Fix PROD-212 Harden SOC2 audit log signing and key vault",
        branch_name: "feature/PROD-212-soc2-vault",
        labels: "ga",
        body: `Implements SOC2 audit log retention and vault signing.\nAccidental test key: ${["ghp", "1234567890abcdef1234567890abcdef123456"].join("_")}`,
        draft_copy: "Project Apollo brings guaranteed 100% uptime for SOC2 logs!",
      });
    } else {
      setPfForm({
        source: "GITHUB",
        title: "feat!: Deprecate legacy v1 webhook endpoint for PROD-310",
        branch_name: "feature/PROD-310-v2-webhooks",
        labels: "ga",
        body: "BREAKING CHANGE: Removed endpoint /v1/hooks in favor of /v2/webhooks. Includes docs/migration-v2.md.",
        draft_copy: "",
      });
    }
  };

  const handleAcceptTriage = async (id: string) => {
    setReviewBusyId(id);
    setReviewError(null);
    try {
      await api.acceptTriage(id);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to accept link.");
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleRejectTriage = async (id: string) => {
    setReviewBusyId(id);
    setReviewError(null);
    try {
      await api.rejectTriage(id);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to ignore link.");
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleSignoff = async (role: string, signedBy: string) => {
    if (!selectedCandidateId) return;
    setReviewBusyId(`signoff:${role}`);
    setReviewError(null);
    try {
      await api.addDomainSignoff(selectedCandidateId, role, signedBy);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Failed to record sign-off."
      );
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleConfirmTier = async (tier: string, reason?: string) => {
    if (!selectedCandidateId) return;
    setReviewBusyId("confirm");
    setReviewError(null);
    try {
      await api.confirmCandidate(selectedCandidateId, tier, reason);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Launch approval blocked."
      );
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleRejectCandidate = async (reason: string) => {
    if (!selectedCandidateId) return;
    setReviewBusyId("reject");
    setReviewError(null);
    try {
      await api.rejectCandidate(selectedCandidateId, reason);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Failed to reject feature."
      );
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleSoftUnlink = async (membershipId: string, reason: string) => {
    setReviewError(null);
    try {
      await api.softUnlinkMembership(membershipId, reason);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to unlink.");
    }
  };

  const handleGenerateDrafts = async () => {
    if (!selectedCandidateId) return;
    setLintBusy(true);
    setLintError(null);
    try {
      const res = await api.generateDrafts(selectedCandidateId);
      await loadWorkspaceData(selectedCandidateId);
      if (res.drafts[0]) setSelectedDraftId(res.drafts[0].id);
    } catch (err) {
      setLintError(
        err instanceof Error ? err.message : "Failed to generate drafts."
      );
    } finally {
      setLintBusy(false);
    }
  };

  const handleSaveDraft = async (draftId: string, content: string) => {
    setLintBusy(true);
    setLintError(null);
    try {
      await api.updateDraft(draftId, content);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setLintError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setLintBusy(false);
    }
  };

  const handleOverrideWarning = async (
    draftId: string,
    ruleCode: string,
    reason: string
  ) => {
    setLintBusy(true);
    setLintError(null);
    try {
      await api.overrideLint(draftId, ruleCode, reason);
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setLintError(
        err instanceof Error ? err.message : "Failed to approve exception."
      );
    } finally {
      setLintBusy(false);
    }
  };

  const handleUpdateBrandProfile = async (next: Partial<BrandProfile>) => {
    setLintBusy(true);
    setLintError(null);
    try {
      const updated = await api.updateBrandProfile(next);
      setBrandProfile(updated);
      if (selectedDraftId) {
        const draft = selectedDetail?.drafts.find((d) => d.id === selectedDraftId);
        if (draft) {
          await api.updateDraft(draft.id, draft.content);
        }
      }
      await loadWorkspaceData(selectedCandidateId);
    } catch (err) {
      setLintError(
        err instanceof Error ? err.message : "Failed to update guardrails."
      );
    } finally {
      setLintBusy(false);
    }
  };

  const handleOpenExtModal = async () => {
    setExtModalOpen(true);
    if (!extManifest) {
      try {
        const data = await api.getExtensionManifest();
        setExtManifest(data);
      } catch {
        // fallback inside modal
      }
    }
  };

  const handleResetDemo = async () => {
    setReviewError(null);
    setLintError(null);
    setPfSimResult(null);
    await api.resetDemo();
    await loadWorkspaceData(null);
  };

  const selectedDraft =
    selectedDetail?.drafts.find((d) => d.id === selectedDraftId) ||
    selectedDetail?.drafts[0] ||
    null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 dark:bg-[#0D1117] text-slate-900 dark:text-slate-100">
      {/* Clean Single Top Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B22] px-6">
        <a
          href="/"
          className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          LaunchGraph
        </a>

        <nav
          aria-label="Primary Workflow"
          className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          <button
            type="button"
            onClick={() => setActiveStep("preflight")}
            className={`border-b-2 py-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeStep === "preflight"
                ? "border-blue-600 text-slate-900 dark:text-white font-semibold"
                : "border-transparent hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            1. Engineer Check
          </button>

          <button
            type="button"
            onClick={() => setActiveStep("review")}
            className={`border-b-2 py-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeStep === "review"
                ? "border-blue-600 text-slate-900 dark:text-white font-semibold"
                : "border-transparent hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            2. Launch Review ({candidates.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveStep("linters")}
            className={`border-b-2 py-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeStep === "linters"
                ? "border-blue-600 text-slate-900 dark:text-white font-semibold"
                : "border-transparent hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            3. Copy &amp; Safety
          </button>

          <a
            href="/diagrams"
            className="hidden sm:inline border-b-2 border-transparent py-4 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Diagrams
          </a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDemo}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Demo
          </button>

          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {darkMode ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenExtModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Blocks className="h-3.5 w-3.5" aria-hidden="true" />
            VS Code Extension
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeStep === "preflight" && (
          <PreFlightWorkspace
            form={pfForm}
            report={pfReport}
            scanning={pfScanning}
            simulating={pfSimulating}
            simResult={pfSimResult}
            error={pfError}
            onChange={setPfForm}
            onLoadPreset={handleLoadPreset}
            onScan={handleScanPreFlight}
            onSimulateWebhook={handleSimulateWebhook}
            onGoToReview={() => setActiveStep("review")}
          />
        )}

        {activeStep === "review" && (
          <ReviewWorkspace
            triageItems={triageItems}
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            selectedDetail={selectedDetail}
            tierFilter={tierFilter}
            busyId={reviewBusyId}
            error={reviewError}
            onTierFilterChange={setTierFilter}
            onSelectCandidate={handleSelectCandidate}
            onAcceptTriage={handleAcceptTriage}
            onRejectTriage={handleRejectTriage}
            onSignoff={handleSignoff}
            onConfirmTier={handleConfirmTier}
            onRejectCandidate={handleRejectCandidate}
            onSoftUnlink={handleSoftUnlink}
            onGoToLinters={() => setActiveStep("linters")}
          />
        )}

        {activeStep === "linters" && (
          <LintersWorkspace
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            detail={selectedDetail}
            selectedDraft={selectedDraft}
            brandProfile={brandProfile}
            busy={lintBusy}
            error={lintError}
            onSelectCandidate={handleSelectCandidate}
            onSelectDraft={setSelectedDraftId}
            onGenerateDrafts={handleGenerateDrafts}
            onSaveDraft={handleSaveDraft}
            onOverrideWarning={handleOverrideWarning}
            onUpdateBrandProfile={handleUpdateBrandProfile}
          />
        )}
      </div>

      <ExtensionBundleModal
        open={extModalOpen}
        manifest={extManifest}
        onClose={() => setExtModalOpen(false)}
      />
    </div>
  );
}

export default App;
