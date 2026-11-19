import React from "react";
import { X, Terminal, Blocks } from "lucide-react";
import type { ExtensionManifestInfo } from "../types";

interface ExtensionBundleModalProps {
  open: boolean;
  manifest: ExtensionManifestInfo | null;
  onClose: () => void;
}

export const ExtensionBundleModal: React.FC<ExtensionBundleModalProps> = ({
  open,
  manifest,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ext-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161B22] shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2
              id="ext-modal-title"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              VS Code Sidebar Extension Bundle
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close extension modal"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            The installable VS Code extension source lives in{" "}
            <code className="font-mono text-blue-600 dark:text-blue-400">
              vscode-extension/
            </code>
            . It registers an Activity Bar view container,{" "}
            <code className="font-mono">vscode.WebviewViewProvider</code> sidebar, and active-editor pre-flight command wired to this LaunchGraph API.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              Run Extension Development Host
            </div>
            <pre className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1117] p-3 font-mono text-xs text-slate-800 dark:text-slate-200">
              {(manifest?.install_commands || [
                "cd vscode-extension",
                "npm install && npm run compile",
                "code --extensionDevelopmentPath=.",
              ]).join("\n")}
            </pre>
          </div>

          {manifest?.package_json && (
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                vscode-extension/package.json
              </div>
              <pre className="max-h-56 overflow-y-auto rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1117] p-3 font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                {JSON.stringify(manifest.package_json, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
