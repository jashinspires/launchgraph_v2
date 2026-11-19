import * as vscode from "vscode";

class LaunchGraphSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "launchgraph.sidebarView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const config = vscode.workspace.getConfiguration("launchgraph");
    const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";
    const workspaceId =
      config.get<string>("workspaceId") || "11111111-1111-1111-1111-111111111111";

    webviewView.webview.html = this._getHtml(serverUrl, workspaceId);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "scanActiveEditor") {
        await this.scanActiveEditor();
      }
    });
  }

  public async scanActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const content = editor ? editor.document.getText() : "";
    const fileName = editor ? editor.document.fileName : "PR Draft";
    const config = vscode.workspace.getConfiguration("launchgraph");
    const serverUrl = config.get<string>("serverUrl") || "http://localhost:3000";

    try {
      const response = await fetch(`${serverUrl}/api/preflight/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fileName.split(/[\\/]/).pop() || "Active Editor Buffer",
          body: content,
          source_type: "GITHUB",
        }),
      });
      const report = await response.json();
      this._view?.webview.postMessage({ type: "preflightResult", report });
    } catch (err) {
      vscode.window.showErrorMessage(
        `LaunchGraph scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  public refresh(): void {
    this._view?.webview.postMessage({ type: "refreshAll" });
  }

  private _getHtml(serverUrl: string, workspaceId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; font-size: 13px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 8px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .section { border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; margin-top: 10px; }
    .mono { font-family: var(--vscode-editor-font-family); font-size: 12px; }
  </style>
</head>
<body>
  <strong>LaunchGraph Sidebar</strong>
  <p class="mono">API: ${serverUrl}<br/>Workspace: ${workspaceId.slice(0, 8)}...</p>
  <button id="scanBtn">Scan Active Editor (Pre-Flight)</button>
  <button id="refreshBtn">Refresh Review Queue</button>
  <div id="output" class="section">Open the Workbench view or run a pre-flight scan.</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById("scanBtn").addEventListener("click", () => {
      vscode.postMessage({ type: "scanActiveEditor" });
    });
    document.getElementById("refreshBtn").addEventListener("click", async () => {
      const res = await fetch("${serverUrl}/api/candidates");
      const data = await res.json();
      document.getElementById("output").innerText =
        "Pending candidates: " + (data.count ?? 0);
    });
    window.addEventListener("message", (event) => {
      if (event.data.type === "preflightResult") {
        const r = event.data.report;
        document.getElementById("output").innerText =
          "Ready: " + r.ready_for_push + " | Redactions: " + r.secrets.redaction_count +
          " | Anchor: " + r.references.predicted_anchor_ref;
      }
    });
  </script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new LaunchGraphSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LaunchGraphSidebarProvider.viewType,
      provider
    ),
    vscode.commands.registerCommand("launchgraph.runPreflight", () =>
      provider.scanActiveEditor()
    ),
    vscode.commands.registerCommand("launchgraph.refresh", () =>
      provider.refresh()
    )
  );
}

export function deactivate(): void {}
