# LaunchGraph VS Code Sidebar Extension

Integrates LaunchGraph Stage 1–4 telemetry, Pre-Flight Secret/Sensitivity Scanning, PMM Consensus Review, and 14-Rule Copy Governance directly inside the VS Code Activity Bar.

## Local Development Host Setup

```bash
cd vscode-extension
npm install
npm run compile
code --extensionDevelopmentPath=.
```

Configure `launchgraph.serverUrl` (default `http://localhost:3000`) in VS Code Settings to connect to your LaunchGraph API instance.
