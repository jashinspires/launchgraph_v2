import fs from "node:fs";
import path from "node:path";
import { settings } from "./config.js";
import {
  BrandProfile,
  ChangeEvent,
  ChangeMembership,
  Connection,
  DecisionRun,
  GtmDraft,
  LaunchCandidate,
  LinkSuggestion,
  SourceEvent,
  WebhookInboxEntry,
  Workspace,
} from "./types.js";

export const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
export const SLACK_CONN_ID = "22222222-2222-2222-2222-222222222222";
export const GITHUB_CONN_ID = "33333333-3333-3333-3333-333333333333";
export const JIRA_CONN_ID = "44444444-4444-4444-4444-444444444444";

const STATE_DIR = path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(STATE_DIR, "launchgraph-state.json");

export const defaultBrandProfile: BrandProfile = {
  product_summary:
    "LaunchGraph connects GitHub, Jira, and Slack telemetry into a verified Go-To-Market Context Graph.",
  voice_tone: "direct, technical, verifiable, zero-hype",
  codenames: ["Project Apollo", "Codename Phoenix", "Titan-X", "Valkyrie"],
  competitors: ["CompetitorX", "AcmeRival", "LaunchBotPro"],
  disallowed_claims: [
    "guaranteed 100% uptime",
    "zero bugs",
    "unlimited forever",
    "unbreakable security",
  ],
};

export const store = {
  workspaces: new Map<string, Workspace>(),
  connections: new Map<string, Connection>(),
  webhookInbox: new Map<string, WebhookInboxEntry>(),
  sourceEvents: new Map<string, SourceEvent>(),
  changeEvents: new Map<string, ChangeEvent>(),
  changeMemberships: [] as ChangeMembership[],
  linkSuggestions: [] as LinkSuggestion[],
  launchCandidates: new Map<string, LaunchCandidate>(),
  decisionRuns: [] as DecisionRun[],
  gtmDrafts: new Map<string, GtmDraft>(),
  brandProfile: { ...defaultBrandProfile } as BrandProfile,
};

interface SerializedStore {
  workspaces: Array<[string, Workspace]>;
  connections: Array<[string, Connection]>;
  webhookInbox: Array<[string, WebhookInboxEntry]>;
  sourceEvents: Array<[string, SourceEvent]>;
  changeEvents: Array<[string, ChangeEvent]>;
  changeMemberships: ChangeMembership[];
  linkSuggestions: LinkSuggestion[];
  launchCandidates: Array<[string, LaunchCandidate]>;
  decisionRuns: DecisionRun[];
  gtmDrafts: Array<[string, GtmDraft]>;
  brandProfile: BrandProfile;
}

let persistenceEnabled = true;

export function setPersistenceEnabled(enabled: boolean): void {
  persistenceEnabled = enabled;
}

export function persistStore(): void {
  if (!persistenceEnabled) return;
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const snapshot: SerializedStore = {
      workspaces: Array.from(store.workspaces.entries()),
      connections: Array.from(store.connections.entries()),
      webhookInbox: Array.from(store.webhookInbox.entries()),
      sourceEvents: Array.from(store.sourceEvents.entries()),
      changeEvents: Array.from(store.changeEvents.entries()),
      changeMemberships: store.changeMemberships,
      linkSuggestions: store.linkSuggestions,
      launchCandidates: Array.from(store.launchCandidates.entries()),
      decisionRuns: store.decisionRuns,
      gtmDrafts: Array.from(store.gtmDrafts.entries()),
      brandProfile: store.brandProfile,
    };
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(snapshot, null, 2), "utf8");
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.warn("[LaunchGraph] Failed to persist state snapshot:", err);
  }
}

export function clearStore(): void {
  store.workspaces.clear();
  store.connections.clear();
  store.webhookInbox.clear();
  store.sourceEvents.clear();
  store.changeEvents.clear();
  store.changeMemberships.length = 0;
  store.linkSuggestions.length = 0;
  store.launchCandidates.clear();
  store.decisionRuns.length = 0;
  store.gtmDrafts.clear();
  store.brandProfile = {
    ...defaultBrandProfile,
    codenames: [...defaultBrandProfile.codenames],
    competitors: [...defaultBrandProfile.competitors],
    disallowed_claims: [...defaultBrandProfile.disallowed_claims],
  };
}

export function initStore(loadFromDisk = true): boolean {
  let loaded = false;

  if (loadFromDisk && persistenceEnabled && fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<SerializedStore>;
      clearStore();
      if (parsed.workspaces) {
        parsed.workspaces.forEach(([k, v]) => store.workspaces.set(k, v));
      }
      if (parsed.connections) {
        parsed.connections.forEach(([k, v]) => store.connections.set(k, v));
      }
      if (parsed.webhookInbox) {
        parsed.webhookInbox.forEach(([k, v]) => store.webhookInbox.set(k, v));
      }
      if (parsed.sourceEvents) {
        parsed.sourceEvents.forEach(([k, v]) => store.sourceEvents.set(k, v));
      }
      if (parsed.changeEvents) {
        parsed.changeEvents.forEach(([k, v]) => store.changeEvents.set(k, v));
      }
      if (parsed.changeMemberships) {
        store.changeMemberships.push(...parsed.changeMemberships);
      }
      if (parsed.linkSuggestions) {
        store.linkSuggestions.push(...parsed.linkSuggestions);
      }
      if (parsed.launchCandidates) {
        parsed.launchCandidates.forEach(([k, v]) =>
          store.launchCandidates.set(k, v)
        );
      }
      if (parsed.decisionRuns) {
        store.decisionRuns.push(...parsed.decisionRuns);
      }
      if (parsed.gtmDrafts) {
        parsed.gtmDrafts.forEach(([k, v]) => store.gtmDrafts.set(k, v));
      }
      if (parsed.brandProfile) {
        store.brandProfile = parsed.brandProfile;
      }
      loaded = store.workspaces.size > 0;
    } catch (err) {
      console.warn("[LaunchGraph] Corrupt state file, reinitializing:", err);
      clearStore();
    }
  }

  const now = new Date().toISOString();

  if (!store.workspaces.has(WORKSPACE_ID)) {
    store.workspaces.set(WORKSPACE_ID, {
      id: WORKSPACE_ID,
      slug: "launchgraph-hq",
      name: "LaunchGraph Engineering HQ",
      tier: "production",
      settings: { data_retention_days: settings.DATA_RETENTION_DAYS },
      created_at: now,
    });
  }

  if (!store.connections.has(SLACK_CONN_ID)) {
    store.connections.set(SLACK_CONN_ID, {
      id: SLACK_CONN_ID,
      workspace_id: WORKSPACE_ID,
      source_type: "SLACK",
      status: "ACTIVE",
      config: {
        bot_token: settings.SLACK_BOT_TOKEN,
        app_token: settings.SLACK_APP_TOKEN,
        signing_secret: settings.SLACK_SIGNING_SECRET,
        team_id: "T0C89SDQRLM",
        app_id: "A0C89TBK8DT",
      },
      created_at: now,
    });
  }

  if (!store.connections.has(GITHUB_CONN_ID)) {
    store.connections.set(GITHUB_CONN_ID, {
      id: GITHUB_CONN_ID,
      workspace_id: WORKSPACE_ID,
      source_type: "GITHUB",
      status: "ACTIVE",
      config: {
        webhook_secret: settings.GITHUB_WEBHOOK_SECRET,
        github_token: settings.GITHUB_TOKEN,
        repo: settings.GITHUB_REPO,
      },
      created_at: now,
    });
  }

  if (!store.connections.has(JIRA_CONN_ID)) {
    store.connections.set(JIRA_CONN_ID, {
      id: JIRA_CONN_ID,
      workspace_id: WORKSPACE_ID,
      source_type: "JIRA",
      status: "ACTIVE",
      config: {
        webhook_secret: settings.JIRA_WEBHOOK_SECRET,
        jira_token: settings.JIRA_API_TOKEN,
        email: settings.JIRA_EMAIL,
        domain: settings.JIRA_DOMAIN,
      },
      created_at: now,
    });
  }

  return loaded;
}
